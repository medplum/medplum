// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, MedplumRequestOptions } from '@medplum/core';
import { badRequest, OperationOutcomeError, resolveId } from '@medplum/core';
import type { Appointment, CodeableConcept, Parameters } from '@medplum/fhirtypes';

/**
 * Answers `Appointment/[id]/$cancel` against the stored resources.
 *
 * `MockClient` has no scheduling operations, so a story or test that cancels has to
 * stand in for the server. It does what the operation does: refuses a status the
 * operation refuses, sets the appointment to `cancelled`, records the `cancelationReason`
 * it was given, and deletes every Slot it was holding.
 *
 * @param medplum - The client to patch. Other requests are passed through.
 * @returns A function restoring the client's own `post`.
 */
export function installCancelStub(medplum: MedplumClient): () => void {
  const original = medplum.post.bind(medplum);

  medplum.post = async function stubbedPost<T>(
    url: string | URL,
    body?: unknown,
    contentType?: string,
    options?: MedplumRequestOptions
  ): Promise<T> {
    const asString = url.toString();
    const match = /Appointment\/([^/]+)\/(?:%24|\$)cancel$/.exec(asString);
    if (!match) {
      return original(url, body, contentType, options);
    }
    return cancelAppointment(medplum, match[1], readReason(body)) as Promise<T>;
  } as MedplumClient['post'];

  return () => {
    medplum.post = original;
  };
}

/**
 * Reads the reason out of the request, as the operation's input parameters carry it.
 * @param body - What was posted to `$cancel`.
 * @returns The reason, or undefined when the caller sent none.
 */
function readReason(body: unknown): CodeableConcept | undefined {
  const parameters = body as Parameters | undefined;
  return parameters?.parameter?.find((parameter) => parameter.name === 'cancelationReason')?.valueCodeableConcept;
}

async function cancelAppointment(
  medplum: MedplumClient,
  id: string,
  cancelationReason: CodeableConcept | undefined
): Promise<Appointment> {
  const appointment = await medplum.readResource('Appointment', id);
  if (appointment.status !== 'pending' && appointment.status !== 'booked') {
    throw new OperationOutcomeError(badRequest(`Appointment cannot be canceled in '${appointment.status}' status`));
  }

  const cancelled = await medplum.updateResource<Appointment>({
    ...appointment,
    status: 'cancelled',
    cancelationReason: cancelationReason ?? appointment.cancelationReason,
  });
  for (const slot of appointment.slot ?? []) {
    const slotId = resolveId(slot);
    if (slotId) {
      await medplum.deleteResource('Slot', slotId);
    }
  }
  return cancelled;
}

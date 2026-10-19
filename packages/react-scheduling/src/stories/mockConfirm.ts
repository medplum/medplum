// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, MedplumRequestOptions } from '@medplum/core';
import { badRequest, OperationOutcomeError } from '@medplum/core';
import type { Appointment, Bundle, Slot } from '@medplum/fhirtypes';

/**
 * Answers `Appointment/[id]/$confirm` against the stored resources.
 *
 * `MockClient` has no scheduling operations, so a story or test that confirms has to
 * stand in for the server. It does what the operation does: refuses a status the
 * operation refuses, sets the appointment to `booked`, and firms up every tentative
 * Slot it was holding.
 *
 * @param medplum - The client to patch. Other requests are passed through.
 * @returns A function restoring the client's own `post`.
 */
export function installConfirmStub(medplum: MedplumClient): () => void {
  const original = medplum.post.bind(medplum);

  medplum.post = async function stubbedPost<T>(
    url: string | URL,
    body?: unknown,
    contentType?: string,
    options?: MedplumRequestOptions
  ): Promise<T> {
    const match = /Appointment\/([^/]+)\/(?:%24|\$)confirm$/.exec(url.toString());
    if (!match) {
      return original(url, body, contentType, options);
    }
    return confirmAppointment(medplum, match[1]) as Promise<T>;
  } as MedplumClient['post'];

  return () => {
    medplum.post = original;
  };
}

async function confirmAppointment(medplum: MedplumClient, id: string): Promise<Bundle> {
  const appointment = await medplum.readResource('Appointment', id);
  if (appointment.status !== 'pending' && appointment.status !== 'proposed') {
    throw new OperationOutcomeError(badRequest(`Appointment cannot be confirmed in '${appointment.status}' status`));
  }

  const slots = await Promise.all(
    (appointment.slot ?? []).map(async (reference) => {
      const slot = await medplum.readReference(reference);
      return slot.status === 'busy-tentative' ? medplum.updateResource<Slot>({ ...slot, status: 'busy' }) : slot;
    })
  );
  const confirmed = await medplum.updateResource<Appointment>({ ...appointment, status: 'booked' });

  return {
    resourceType: 'Bundle',
    type: 'transaction-response',
    entry: [confirmed, ...slots].map((resource) => ({ resource })),
  };
}

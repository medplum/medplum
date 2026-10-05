// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, MedplumRequestOptions } from '@medplum/core';
import type { Appointment, Bundle, Parameters, Slot } from '@medplum/fhirtypes';

/**
 * Answers `Appointment/$book` by persisting what it was handed.
 *
 * `MockClient` has no scheduling operations, so a story that books has to stand
 * in for the server. It reserves nothing and checks no availability — it writes
 * the appointment and a Slot per schedule it is held on, which is enough for the
 * flow around it to behave the way it will against a real server.
 *
 * @param medplum - The client to patch. Other requests are passed through.
 * @returns A function restoring the client's own `post`.
 */
export function installBookStub(medplum: MedplumClient): () => void {
  const original = medplum.post.bind(medplum);

  medplum.post = async function stubbedPost<T>(
    url: string | URL,
    body?: unknown,
    contentType?: string,
    options?: MedplumRequestOptions
  ): Promise<T> {
    const asString = url.toString();
    if (!asString.includes('Appointment/%24book') && !asString.includes('Appointment/$book')) {
      return original(url, body, contentType, options);
    }
    return bookAppointment(medplum, body as Parameters) as Promise<T>;
  } as MedplumClient['post'];

  return () => {
    medplum.post = original;
  };
}

async function bookAppointment(medplum: MedplumClient, parameters: Parameters): Promise<Bundle> {
  const proposal = parameters.parameter?.find((parameter) => parameter.name === 'appointment')?.resource as
    Appointment | undefined;
  if (!proposal) {
    throw new Error('$book was called without an appointment');
  }

  // A proposal carries its Slots contained, having no id to reference them by
  // until something writes them. Booking is what gives them one.
  const contained = (proposal.contained ?? []).filter((resource): resource is Slot => resource.resourceType === 'Slot');
  const slots = await Promise.all(contained.map(async (slot) => medplum.createResource<Slot>({ ...slot })));

  const appointment = await medplum.createResource<Appointment>({
    ...proposal,
    status: 'booked',
    contained: undefined,
    slot: slots.map((slot) => ({ reference: `Slot/${slot.id}` })),
  });

  return {
    resourceType: 'Bundle',
    type: 'transaction-response',
    entry: [appointment, ...slots].map((resource) => ({ resource })),
  };
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, MedplumRequestOptions } from '@medplum/core';
import {
  generateId,
  getExtension,
  RecurrenceIdExtensionURI,
  RecurrenceTemplateExtensionURI,
  RecurringAppointmentSeriesIdentifierSystem,
} from '@medplum/core';
import type { Appointment, Bundle, Parameters, Slot } from '@medplum/fhirtypes';

/**
 * Answers `Appointment/$book` by persisting what it was handed.
 *
 * `MockClient` has no scheduling operations, so a story that books has to stand
 * in for the server. It reserves nothing and checks no availability — it writes
 * the appointment and a Slot per schedule it is held on, once a week for as many
 * weeks as a series names, which is enough for the flow around it to behave the
 * way it will against a real server.
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function bookAppointment(medplum: MedplumClient, parameters: Parameters): Promise<Bundle> {
  const proposal = parameters.parameter?.find((parameter) => parameter.name === 'appointment')?.resource as
    Appointment | undefined;
  if (!proposal) {
    throw new Error('$book was called without an appointment');
  }

  const occurrenceCount =
    getExtension(proposal, RecurrenceTemplateExtensionURI, 'occurrenceCount')?.valuePositiveInt ?? 1;
  if (occurrenceCount === 1) {
    const { appointment, slots } = await bookOccurrence(medplum, proposal, 0);
    return toBundle([appointment], slots);
  }

  // Tagged as the server tags a series, its template kept on the first occurrence alone.
  // Weeks are counted in UTC: no story crosses a change of clocks.
  const seriesId = generateId();
  const written = [];
  for (let week = 0; week < occurrenceCount; week++) {
    written.push(
      await bookOccurrence(
        medplum,
        {
          ...proposal,
          identifier: [
            ...(proposal.identifier ?? []),
            { system: RecurringAppointmentSeriesIdentifierSystem, value: seriesId },
          ],
          extension: [
            ...(proposal.extension ?? []).filter((ext) => week === 0 || ext.url !== RecurrenceTemplateExtensionURI),
            { url: RecurrenceIdExtensionURI, valuePositiveInt: week + 1 },
          ],
        },
        week
      )
    );
  }
  return toBundle(
    written.map(({ appointment }) => appointment),
    written.flatMap(({ slots }) => slots)
  );
}

/**
 * Writes one appointment of a booking, and the Slots it holds.
 * @param medplum - The client to write through.
 * @param proposal - The appointment as proposed, which is the first occurrence.
 * @param week - How many weeks after the proposal this occurrence falls.
 * @returns The appointment and its Slots, as written.
 */
async function bookOccurrence(
  medplum: MedplumClient,
  proposal: Appointment,
  week: number
): Promise<{ appointment: Appointment; slots: Slot[] }> {
  const shift = (instant: string): string => new Date(Date.parse(instant) + week * WEEK_MS).toISOString();

  // A proposal carries its Slots contained, having no id to reference them by
  // until something writes them. Booking is what gives them one.
  const contained = (proposal.contained ?? []).filter((resource): resource is Slot => resource.resourceType === 'Slot');
  const slots = await Promise.all(
    contained.map(async (slot) =>
      medplum.createResource<Slot>({ ...slot, start: shift(slot.start), end: shift(slot.end) })
    )
  );

  const appointment = await medplum.createResource<Appointment>({
    ...proposal,
    status: 'booked',
    start: proposal.start && shift(proposal.start),
    end: proposal.end && shift(proposal.end),
    contained: undefined,
    slot: slots.map((slot) => ({ reference: `Slot/${slot.id}` })),
  });
  return { appointment, slots };
}

function toBundle(appointments: Appointment[], slots: Slot[]): Bundle {
  return {
    resourceType: 'Bundle',
    type: 'transaction-response',
    entry: [...appointments, ...slots].map((resource) => ({ resource })),
  };
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { Appointment, Bundle, HealthcareService, Schedule } from '@medplum/fhirtypes';
import { getServiceDurationMinutes } from '../AppointmentFinder/AppointmentServiceSelect.utils';
import { buildFindBundle, buildProposedAppointment } from './scheduling';

/** Clinic hours the stub offers times within, as local hours of the day. */
const OPENS_AT = 9;
const CLOSES_AT = 17;

/** Fallback visit length for a service that configures none. */
const DEFAULT_DURATION_MINUTES = 30;

export interface FindStubOptions {
  /** Offer nothing at all, for the empty state. Defaults to false. */
  readonly empty?: boolean;
}

/**
 * Answers `Appointment/$find` against the resources a MockClient already holds.
 *
 * `MockClient` has no scheduling operations. This intersects nothing and checks no
 * availability: it lays times on the alignment grid through the range asked for, on
 * the schedules asked for.
 *
 * @param medplum - The client to patch. Other requests are passed through.
 * @param options - Whether to offer anything.
 * @returns A function restoring the client's own `get`.
 */
export function installFindStub(medplum: MedplumClient, options: FindStubOptions = {}): () => void {
  const original = medplum.get.bind(medplum);

  medplum.get = async function stubbedGet<T>(url: string | URL, requestOptions?: RequestInit): Promise<T> {
    const asString = url.toString();
    if (!asString.includes('Appointment/%24find') && !asString.includes('Appointment/$find')) {
      return original(url, requestOptions);
    }
    return findTimes(medplum, new URL(asString), options) as Promise<T>;
  } as MedplumClient['get'];

  return () => {
    medplum.get = original;
  };
}

async function findTimes(medplum: MedplumClient, url: URL, options: FindStubOptions): Promise<Bundle<Appointment>> {
  const start = new Date(url.searchParams.get('start') ?? '');
  const end = new Date(url.searchParams.get('end') ?? '');
  const scheduleReferences = url.searchParams.getAll('schedule');
  const serviceReference = url.searchParams.get('service-type-reference') ?? '';
  const count = Number(url.searchParams.get('_count') ?? '20');

  if (options.empty || scheduleReferences.length === 0 || Number.isNaN(start.getTime())) {
    return buildFindBundle([]);
  }

  const schedules = await Promise.all(
    scheduleReferences.map(async (reference) => medplum.readReference<Schedule>({ reference }))
  );
  const service = await medplum.readReference<HealthcareService>({ reference: serviceReference });
  const durationMinutes = getServiceDurationMinutes(service) ?? DEFAULT_DURATION_MINUTES;

  // `$find` answers an intersected set of schedules with one appointment carrying
  // every actor, so the stub does the same.
  const actorReferences = schedules.map((schedule) => schedule.actor[0]);

  const appointments: Appointment[] = [];
  for (const slotStart of enumerateSlots(start, end, durationMinutes)) {
    if (appointments.length >= count) {
      break;
    }
    appointments.push(
      buildProposedAppointment({
        start: slotStart.toISOString(),
        durationMinutes,
        scheduleReferences,
        actorReferences,
        serviceId: serviceReference.split('/')[1],
      })
    );
  }

  return buildFindBundle(appointments);
}

/**
 * Walks the clinic's open hours through a range, a visit's length at a time.
 * @param start - First instant the search covers.
 * @param end - Last instant the search covers.
 * @param durationMinutes - How long one visit runs.
 * @yields Each time a visit could start at.
 */
function* enumerateSlots(start: Date, end: Date, durationMinutes: number): Generator<Date> {
  const first = new Date(start);
  first.setHours(0, 0, 0, 0);

  for (let offset = 0; ; offset++) {
    const day = new Date(first);
    day.setDate(day.getDate() + offset);
    if (day > end) {
      return;
    }
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) {
      continue;
    }
    for (let minute = OPENS_AT * 60; minute + durationMinutes <= CLOSES_AT * 60; minute += durationMinutes) {
      const slot = new Date(day);
      slot.setHours(0, minute, 0, 0);
      if (slot >= start && slot <= end) {
        yield slot;
      }
    }
  }
}

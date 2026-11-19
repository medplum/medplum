// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import {
  getHealthcareServiceSchedulingParameters,
  RecurrenceTemplateExtensionURI,
  schedulingDurationToMinutes,
} from '@medplum/core';
import type { Appointment, Bundle, HealthcareService, Schedule } from '@medplum/fhirtypes';
import { getServiceDurationMinutes } from '../AppointmentFinder/AppointmentServiceSelect.utils';
import { computeAvailabilityShading, getScheduleAvailabilityWindows } from '../availabilityShading';
import { buildFindBundle, buildProposedAppointment } from './scheduling';

/** Clinic hours the stub offers times within, as local hours of the day. */
const OPENS_AT = 9;
const CLOSES_AT = 17;

/** Fallback visit length for a service that configures none. */
const DEFAULT_DURATION_MINUTES = 30;

export interface FindStubOptions {
  /** Offer nothing at all, for the empty state. Defaults to false. */
  readonly empty?: boolean;
  /**
   * For a schedule that has availability for the visit type, offer only the times it has open: inside
   * that availability, and clear of its appointments and blocked time. A schedule with none is offered
   * through clinic hours, as it is without this. Defaults to false.
   */
  readonly respectAvailability?: boolean;
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
  const occurrenceCount = Number(url.searchParams.get('occurrence-count') ?? '1');

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

  const open = options.respectAvailability
    ? await enumerateOpenTimes(medplum, { schedules, service, start, end, durationMinutes })
    : undefined;

  const appointments: Appointment[] = [];
  for (const slotStart of open ?? enumerateSlots(start, end, durationMinutes)) {
    if (appointments.length >= count) {
      break;
    }
    const proposal = buildProposedAppointment({
      start: slotStart.toISOString(),
      durationMinutes,
      scheduleReferences,
      actorReferences,
      serviceId: serviceReference.split('/')[1],
    });
    if (occurrenceCount > 1) {
      // Only the count, of the template `$find` describes a series with.
      proposal.extension = [
        ...(proposal.extension ?? []),
        {
          url: RecurrenceTemplateExtensionURI,
          extension: [{ url: 'occurrenceCount', valuePositiveInt: occurrenceCount }],
        },
      ];
    }
    appointments.push(proposal);
  }

  return buildFindBundle(appointments);
}

interface OpenTimesInput {
  readonly schedules: readonly WithId<Schedule>[];
  readonly service: WithId<HealthcareService>;
  readonly start: Date;
  readonly end: Date;
  readonly durationMinutes: number;
}

interface Interval {
  readonly start: number;
  readonly end: number;
}

// The stretches two lists of intervals, each in order and free of overlaps, both cover.
function intersect(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const both: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);
    if (start < end) {
      both.push({ start, end });
    }
    if (a[i].end < b[j].end) {
      i++;
    } else {
      j++;
    }
  }
  return both;
}

/**
 * Lays times on the visit type's alignment grid through the time every schedule with availability for it
 * has open.
 *
 * Open time is worked out as the calendar's shading works it out, so the two agree.
 * @param medplum - The client holding the appointments and Slots.
 * @param input - The schedules, visit type and window asked about.
 * @returns Each time a visit could start at, in order, or undefined when no schedule has availability for
 * the visit type.
 */
async function enumerateOpenTimes(medplum: MedplumClient, input: OpenTimesInput): Promise<Date[] | undefined> {
  const { schedules, service, start, end, durationMinutes } = input;
  const withAvailability = schedules.filter((schedule) => getScheduleAvailabilityWindows(schedule, service).length);
  if (!withAvailability.length) {
    return undefined;
  }

  const openBySchedule = await Promise.all(
    withAvailability.map(async (schedule): Promise<Interval[]> => {
      const [appointments, slots] = await Promise.all([
        medplum.searchResources('Appointment', { actor: schedule.actor[0].reference ?? '', _count: '1000' }),
        medplum.searchResources('Slot', { schedule: `Schedule/${schedule.id}`, _count: '1000' }),
      ]);
      const { shades } = computeAvailabilityShading({
        calendars: [{ schedule, appointments, slots }],
        services: [],
        filters: { service },
        range: { start, end },
        colorOf: () => 'gray',
      });
      return shades.map((shade) => ({ start: shade.start.getTime(), end: shade.end.getTime() }));
    })
  );

  const alignment = getHealthcareServiceSchedulingParameters(service, 'alignmentInterval')[0]?.valueDuration;
  const stepMs = (schedulingDurationToMinutes(alignment) ?? durationMinutes) * 60_000;
  const durationMs = durationMinutes * 60_000;

  const times: Date[] = [];
  for (const block of openBySchedule.reduce(intersect)) {
    const midnight = new Date(block.start);
    midnight.setHours(0, 0, 0, 0);
    // The first grid line at or after the block opens, counted from the day's midnight.
    const offset = Math.ceil((block.start - midnight.getTime()) / stepMs) * stepMs;
    for (let time = midnight.getTime() + offset; time + durationMs <= block.end; time += stepMs) {
      if (time >= start.getTime() && time <= end.getTime()) {
        times.push(new Date(time));
      }
    }
  }
  return times;
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

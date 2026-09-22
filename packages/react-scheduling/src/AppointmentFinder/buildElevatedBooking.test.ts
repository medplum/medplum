// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SchedulingParameterUrl, WithId } from '@medplum/core';
import {
  getReferenceString,
  SchedulingSlotCapacityURI,
  SchedulingUnvalidatedBookingURI,
  setScheduleSchedulingParameter,
} from '@medplum/core';
import type { Appointment, Bundle, HealthcareService, Schedule, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { DrRiveraSchedule, Ultrasound1Schedule, UltrasoundImagingService } from '../stories/scheduling';
import { buildElevatedBooking, writeElevatedBooking } from './buildElevatedBooking';

const START = new Date('2026-08-17T14:07:00.000Z');

function withParameter(schedule: WithId<Schedule>, url: SchedulingParameterUrl, value: object): WithId<Schedule> {
  return setScheduleSchedulingParameter(schedule, UltrasoundImagingService, { url, ...value });
}

function busySlots(proposal: Appointment): Slot[] {
  return (proposal.contained ?? []).filter((r): r is Slot => r.resourceType === 'Slot' && r.status === 'busy');
}

function bufferSlots(proposal: Appointment): Slot[] {
  return (proposal.contained ?? []).filter(
    (r): r is Slot => r.resourceType === 'Slot' && r.status === 'busy-unavailable'
  );
}

describe('buildElevatedBooking', () => {
  const service: WithId<HealthcareService> = UltrasoundImagingService;

  test('proposes the typed time, whatever the alignment grid says', () => {
    const proposal = buildElevatedBooking({
      service,
      schedules: [DrRiveraSchedule],
      start: START,
      durationMinutes: 37,
    });

    // The service aligns to 15 minutes and runs 30; neither constrains a typed time.
    expect(proposal.start).toBe('2026-08-17T14:07:00.000Z');
    expect(proposal.end).toBe('2026-08-17T14:44:00.000Z');
    expect(proposal.status).toBe('proposed');
  });

  test('busy slot timestamps match the appointment exactly', () => {
    const proposal = buildElevatedBooking({
      service,
      schedules: [DrRiveraSchedule],
      start: START,
      durationMinutes: 30,
    });
    const [busy] = busySlots(proposal);

    // Compared as strings by the calendar: two roundings that disagree draw a
    // "Blocked" block over the visit.
    expect(busy.start).toBe(proposal.start);
    expect(busy.end).toBe(proposal.end);
    expect(busy.schedule).toEqual({ reference: getReferenceString(DrRiveraSchedule), display: undefined });
  });

  test('names the service and everyone attending', () => {
    const proposal = buildElevatedBooking({
      service,
      schedules: [DrRiveraSchedule, Ultrasound1Schedule],
      start: START,
      durationMinutes: 30,
    });

    expect(proposal.serviceType?.[0]?.extension?.[0]?.valueReference?.reference).toBe(
      getReferenceString(UltrasoundImagingService)
    );
    expect(proposal.participant).toEqual([
      { actor: DrRiveraSchedule.actor[0], required: 'required', status: 'needs-action' },
      { actor: Ultrasound1Schedule.actor[0], required: 'required', status: 'needs-action' },
    ]);
  });

  test('reserves every schedule, not only the first', () => {
    const proposal = buildElevatedBooking({
      service,
      schedules: [DrRiveraSchedule, Ultrasound1Schedule],
      start: START,
      durationMinutes: 30,
    });

    expect(busySlots(proposal).map((slot) => slot.schedule?.reference)).toEqual([
      getReferenceString(DrRiveraSchedule),
      getReferenceString(Ultrasound1Schedule),
    ]);
  });

  test('leaves serviceType off the slots, so they block every visit type', () => {
    const proposal = buildElevatedBooking({
      service,
      schedules: [DrRiveraSchedule],
      start: START,
      durationMinutes: 30,
    });

    // A Slot naming a serviceType only blocks that one. `$find` and `$book` both emit
    // none, and a booking placed by hand should not block less than one they placed.
    expect(busySlots(proposal)[0].serviceType).toBeUndefined();
  });

  describe('buffers', () => {
    test('emits none when the service configures none', () => {
      const proposal = buildElevatedBooking({
        service,
        schedules: [DrRiveraSchedule],
        start: START,
        durationMinutes: 30,
      });
      expect(bufferSlots(proposal)).toHaveLength(0);
    });

    test('emits configured buffers, abutting the visit on both sides', () => {
      const schedule = withParameter(
        withParameter(DrRiveraSchedule, 'bufferBefore', { valueDuration: { value: 10, unit: 'min' } }),
        'bufferAfter',
        { valueDuration: { value: 5, unit: 'min' } }
      );

      const proposal = buildElevatedBooking({ service, schedules: [schedule], start: START, durationMinutes: 30 });
      const buffers = bufferSlots(proposal);

      expect(buffers).toHaveLength(2);
      expect(buffers[0]).toMatchObject({
        start: '2026-08-17T13:57:00.000Z',
        end: proposal.start,
        comment: 'buffer before appointment',
      });
      expect(buffers[1]).toMatchObject({
        start: proposal.end,
        end: '2026-08-17T14:42:00.000Z',
        comment: 'buffer after appointment',
      });
    });

    test('resolves buffers per schedule, which may disagree', () => {
      const buffered = withParameter(DrRiveraSchedule, 'bufferAfter', {
        valueDuration: { value: 15, unit: 'min' },
      });

      const proposal = buildElevatedBooking({
        service,
        schedules: [buffered, Ultrasound1Schedule],
        start: START,
        durationMinutes: 30,
      });

      // Only the schedule configuring one gets it: buffers are not a common parameter.
      expect(bufferSlots(proposal).map((slot) => slot.schedule?.reference)).toEqual([
        getReferenceString(DrRiveraSchedule),
      ]);
    });
  });

  describe('capacity', () => {
    test('is left unstamped when the schedule does not overbook', () => {
      const proposal = buildElevatedBooking({
        service,
        schedules: [DrRiveraSchedule],
        start: START,
        durationMinutes: 30,
      });
      expect(busySlots(proposal)[0].extension).toBeUndefined();
    });

    test('is stamped above one, so the rest of the capacity stays bookable', () => {
      const schedule = withParameter(DrRiveraSchedule, 'slotCapacity', { valuePositiveInt: 3 });
      const proposal = buildElevatedBooking({ service, schedules: [schedule], start: START, durationMinutes: 30 });

      // An unstamped slot reads as capacity 1, which would collapse the limit for the
      // whole interval and block the two visits this provider can still take.
      expect(busySlots(proposal)[0].extension).toEqual([{ url: SchedulingSlotCapacityURI, valuePositiveInt: 3 }]);
    });

    test('is never stamped on a buffer', () => {
      const schedule = withParameter(
        withParameter(DrRiveraSchedule, 'slotCapacity', { valuePositiveInt: 3 }),
        'bufferAfter',
        { valueDuration: { value: 10, unit: 'min' } }
      );
      const proposal = buildElevatedBooking({ service, schedules: [schedule], start: START, durationMinutes: 30 });

      expect(bufferSlots(proposal)[0].extension).toBeUndefined();
    });
  });
});

describe('writeElevatedBooking', () => {
  let medplum: MockClient;
  let executeBatch: ReturnType<typeof vi.spyOn>;

  const proposal = (): Appointment =>
    buildElevatedBooking({
      service: UltrasoundImagingService,
      schedules: [DrRiveraSchedule],
      start: START,
      durationMinutes: 30,
    });

  beforeEach(() => {
    medplum = new MockClient();
    executeBatch = vi
      .spyOn(medplum, 'executeBatch')
      .mockResolvedValue({ resourceType: 'Bundle', type: 'transaction-response', entry: [] });
  });

  function sentBundle(): Bundle {
    return executeBatch.mock.calls[0][0] as Bundle;
  }

  test('writes everything in one transaction', async () => {
    await writeElevatedBooking(medplum, proposal());

    // Two sequential POSTs can half-fail; one transaction cannot.
    const bundle = sentBundle();
    expect(bundle.type).toBe('transaction');
    expect(bundle.entry).toHaveLength(2);
    expect(bundle.entry?.map((entry) => entry.request?.url)).toEqual(['Slot', 'Appointment']);
  });

  test('the appointment names the slots written beside it', async () => {
    await writeElevatedBooking(medplum, proposal());

    const bundle = sentBundle();
    const slotUrl = bundle.entry?.[0]?.fullUrl;
    const appointment = bundle.entry?.[1]?.resource as Appointment;

    expect(slotUrl).toMatch(/^urn:uuid:/);
    expect(appointment.slot).toEqual([{ reference: slotUrl }]);
  });

  test('books the appointment and unpacks the contained slots', async () => {
    await writeElevatedBooking(medplum, proposal());

    const appointment = sentBundle().entry?.[1]?.resource as Appointment;
    // The builder emits `$find`'s proposal shape; nothing server-side flips it here.
    expect(appointment.status).toBe('booked');
    expect(appointment.contained).toBeUndefined();
  });

  test('marks the booking as one nothing checked', async () => {
    await writeElevatedBooking(medplum, proposal());

    const appointment = sentBundle().entry?.[1]?.resource as Appointment;

    // Nothing else about the appointment says the rules were skipped.
    expect(appointment.extension).toContainEqual({ url: SchedulingUnvalidatedBookingURI, valueBoolean: true });
  });
});

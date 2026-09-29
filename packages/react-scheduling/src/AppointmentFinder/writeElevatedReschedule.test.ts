// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString, SchedulingSlotCapacityURI, setScheduleSchedulingParameter } from '@medplum/core';
import type { Appointment, Schedule, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import {
  DrOkaforSchedule,
  DrRiveraSchedule,
  ExamRoomASchedule,
  ExamRoomBSchedule,
  ImagingBenchFixtures,
  RiveraImagingAppointment,
  RiveraImagingHeldSlots,
  SchedulingFixtures,
  Ultrasound1Schedule,
  Ultrasound2Schedule,
  UltrasoundImagingService,
} from '../stories/scheduling';
import { buildElevatedBooking } from './buildElevatedBooking';
import { getRescheduleDurationMinutes, writeElevatedReschedule } from './writeElevatedReschedule';

const START = new Date('2026-08-18T03:07:00.000Z');

function proposal(schedules: WithId<Schedule>[] = [DrRiveraSchedule, ExamRoomBSchedule]): Appointment {
  return buildElevatedBooking({ service: UltrasoundImagingService, schedules, start: START, durationMinutes: 999 });
}

describe('writeElevatedReschedule', () => {
  let medplum: MockClient;
  let existing: WithId<Appointment>;

  beforeEach(async () => {
    medplum = new MockClient();
    for (const resource of [...SchedulingFixtures, ...ImagingBenchFixtures, ...RiveraImagingHeldSlots]) {
      await medplum.updateResource(resource);
    }
    existing = await medplum.createResource({
      ...RiveraImagingAppointment,
      start: '2026-08-18T15:00:00Z',
      end: new Date(Date.parse('2026-08-18T15:00:00Z') + 2220123).toISOString(),
      created: '2026-01-01T00:00:00Z',
      comment: 'Keep this clinical detail',
      extension: [{ url: 'https://example.org/metadata', valueString: 'keep' }],
      participant: [
        ...RiveraImagingAppointment.participant.map((p) => ({ ...p, status: 'accepted' as const })),
        { actor: { reference: 'RelatedPerson/support-person' }, status: 'tentative' },
      ],
    });
  });

  test('updates the same appointment, preserves exact length and metadata, and replaces only scheduled actors', async () => {
    const execute = vi.spyOn(medplum, 'executeBatch');
    const original = structuredClone(existing);
    const result = await writeElevatedReschedule(medplum, existing, proposal());
    const bundle = execute.mock.calls[0][0];
    expect(bundle.type).toBe('transaction');
    expect(bundle.entry?.at(-1)?.request).toEqual({
      method: 'PUT',
      url: `Appointment/${existing.id}`,
      ifMatch: `W/"${existing.meta?.versionId}"`,
    });
    expect(
      bundle.entry?.filter((entry) => entry.request?.method === 'DELETE').map((entry) => entry.request?.url)
    ).toEqual(existing.slot?.map(getReferenceString));
    expect(result.appointment.id).toBe(existing.id);
    expect(Date.parse(result.appointment.end as string) - Date.parse(result.appointment.start as string)).toBe(2220123);
    const { start: _start, end: _end, slot: _slot, participant, meta: _meta, ...unchanged } = result.appointment;
    expect(unchanged).toEqual(
      (({ start: _start, end: _end, slot: _slot, participant: _participant, meta: _meta, ...rest }) => rest)(existing)
    );
    expect(participant).toContainEqual(
      existing.participant.find((p) => p.actor?.reference === DrRiveraSchedule.actor[0].reference)
    );
    expect(participant).toContainEqual(existing.participant.at(-1));
    expect(participant.some((p) => p.actor?.reference === ExamRoomASchedule.actor[0].reference)).toBe(false);
    expect(participant).toContainEqual({
      actor: ExamRoomBSchedule.actor[0],
      required: 'required',
      status: 'needs-action',
    });
    expect(result.slots).toHaveLength(2);
    expect(existing).toEqual(original);
  });

  test.each([
    ['provider', DrRiveraSchedule, DrOkaforSchedule],
    ['room', ExamRoomASchedule, ExamRoomBSchedule],
    ['device', Ultrasound1Schedule, Ultrasound2Schedule],
  ] as const)('reassigns a %s into a conflict at the same time', async (_kind, outgoing, incoming) => {
    const selected = [DrRiveraSchedule, ExamRoomASchedule, Ultrasound1Schedule].map((schedule) =>
      schedule.id === outgoing.id ? incoming : schedule
    );
    await medplum.createResource<Slot>({
      resourceType: 'Slot',
      schedule: { reference: getReferenceString(incoming) },
      status: 'busy',
      start: existing.start as string,
      end: existing.end as string,
    });
    const proposed = buildElevatedBooking({
      service: UltrasoundImagingService,
      schedules: selected,
      start: new Date(existing.start as string),
      durationMinutes: 30,
    });
    const result = await writeElevatedReschedule(medplum, existing, proposed);
    expect(Date.parse(result.appointment.start as string)).toBe(Date.parse(existing.start as string));
    expect(result.appointment.participant.some((p) => p.actor?.reference === outgoing.actor[0].reference)).toBe(false);
    expect(
      result.appointment.participant.filter((p) => p.actor?.reference === incoming.actor[0].reference)
    ).toHaveLength(1);
    expect(result.slots).toHaveLength(3);
  });

  test('deduplicates actors shared by two schedules and keeps pending slots tentative', async () => {
    const duplicate = await medplum.updateResource({ ...DrRiveraSchedule, id: 'same-provider-another-schedule' });
    const result = await writeElevatedReschedule(
      medplum,
      { ...existing, status: 'pending' },
      proposal([DrRiveraSchedule, duplicate])
    );
    expect(result.appointment.status).toBe('pending');
    expect(
      result.appointment.participant.filter((p) => p.actor?.reference === DrRiveraSchedule.actor[0].reference)
    ).toHaveLength(1);
    expect(result.slots.every((slot) => slot.status === 'busy-tentative')).toBe(true);
  });

  test('writes capacity and buffers for each schedule while preserving pending status', async () => {
    const buffered = setScheduleSchedulingParameter(
      setScheduleSchedulingParameter(DrRiveraSchedule, UltrasoundImagingService, {
        url: 'bufferBefore',
        valueDuration: { value: 10, unit: 'min' },
      }),
      UltrasoundImagingService,
      { url: 'slotCapacity', valuePositiveInt: 3 }
    );
    await medplum.updateResource(buffered);
    const result = await writeElevatedReschedule(medplum, { ...existing, status: 'pending' }, proposal());
    expect(result.slots).toHaveLength(3);
    expect(
      result.slots.find(
        (slot) => slot.status === 'busy-tentative' && slot.schedule.reference === getReferenceString(buffered)
      )?.extension
    ).toEqual([{ url: SchedulingSlotCapacityURI, valuePositiveInt: 3 }]);
    expect(result.slots.find((slot) => slot.status === 'busy-unavailable')).toMatchObject({
      end: START.toISOString(),
      start: '2026-08-18T02:57:00.000Z',
    });
  });

  test.each(['busy', 'busy-unavailable'] as const)(
    'allows a conflicting %s slot at an off-grid time outside hours',
    async (status) => {
      await medplum.createResource<Slot>({
        resourceType: 'Slot',
        schedule: { reference: getReferenceString(DrRiveraSchedule) },
        status,
        start: START.toISOString(),
        end: '2026-08-18T04:30:00.000Z',
      });
      const result = await writeElevatedReschedule(medplum, existing, proposal());
      expect(result.appointment.start).toBe(START.toISOString());
    }
  );

  test.each([undefined, []])(
    'refuses writes when project transaction support is not confirmed (%s)',
    async (features) => {
      vi.spyOn(medplum, 'getProject').mockReturnValue(features ? { resourceType: 'Project', features } : undefined);
      const execute = vi.spyOn(medplum, 'executeBatch');
      await expect(writeElevatedReschedule(medplum, existing, proposal())).rejects.toThrow('transaction support');
      expect(execute).not.toHaveBeenCalled();
    }
  );

  test('requires a stored version before any write', async () => {
    const execute = vi.spyOn(medplum, 'executeBatch');
    await expect(writeElevatedReschedule(medplum, { ...existing, meta: {} }, proposal())).rejects.toThrow('Reload');
    expect(execute).not.toHaveBeenCalled();
  });

  test.each([undefined, 'invalid', '2026-01-01T00:00:00Z'])(
    'refuses an invalid original interval (%s)',
    async (end) => {
      await expect(writeElevatedReschedule(medplum, { ...existing, end }, proposal())).rejects.toThrow('length');
    }
  );

  test.each([{ active: false }, { serviceType: [] }])(
    'rejects structurally ineligible schedules (%s)',
    async (override) => {
      await medplum.updateResource({ ...ExamRoomBSchedule, ...override });
      const execute = vi.spyOn(medplum, 'executeBatch');
      await expect(writeElevatedReschedule(medplum, existing, proposal())).rejects.toThrow('active and eligible');
      expect(execute).not.toHaveBeenCalled();
    }
  );

  test('refuses failed response entries even when an appointment is present', async () => {
    const execute = medplum.executeBatch.bind(medplum);
    vi.spyOn(medplum, 'executeBatch').mockImplementation(async (bundle) => {
      const response = await execute(bundle);
      const entry = response.entry?.[0];
      if (entry) {
        entry.response = { status: '403 Forbidden' };
      }
      return response;
    });
    await expect(writeElevatedReschedule(medplum, existing, proposal())).rejects.toThrow('every write');
  });

  test.each(['batch-response', 'missing-slot', 'missing-slot-id', 'wrong-id'])(
    'does not announce a malformed response (%s)',
    async (kind) => {
      const execute = medplum.executeBatch.bind(medplum);
      vi.spyOn(medplum, 'executeBatch').mockImplementation(async (bundle) => {
        const response = await execute(bundle);
        if (kind === 'batch-response') {
          response.type = 'batch-response';
        }
        if (kind === 'missing-slot') {
          const entry = response.entry?.find((e) => e.resource?.resourceType === 'Slot');
          if (entry) {
            delete entry.resource;
          }
        }
        if (kind === 'missing-slot-id') {
          const resource = response.entry?.find((e) => e.resource?.resourceType === 'Slot')?.resource;
          if (resource) {
            delete resource.id;
          }
        }
        if (kind === 'wrong-id') {
          const resource = response.entry?.find((e) => e.resource?.resourceType === 'Appointment')?.resource;
          if (resource) {
            resource.id = 'other';
          }
        }
        return response;
      });
      await expect(writeElevatedReschedule(medplum, existing, proposal())).rejects.toThrow();
    }
  );
});

test('duration retains fractional minutes and rejects missing intervals', () => {
  expect(
    getRescheduleDurationMinutes({
      ...RiveraImagingAppointment,
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-01-01T00:30:00.123Z',
    })
  ).toBe(30.00205);
  expect(getRescheduleDurationMinutes({ ...RiveraImagingAppointment, start: undefined })).toBeUndefined();
});

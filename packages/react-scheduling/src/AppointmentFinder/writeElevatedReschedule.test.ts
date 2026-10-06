// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  getPrimaryProvider,
  getReferenceString,
  SchedulingBookedByOperationURI,
  SchedulingSlotCapacityURI,
  setScheduleSchedulingParameter,
} from '@medplum/core';
import type { Appointment, Schedule } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import {
  DrRiveraSchedule,
  ExamRoomASchedule,
  ExamRoomBSchedule,
  ImagingBenchFixtures,
  RiveraImagingAppointment,
  RiveraImagingHeldSlots,
  SchedulingFixtures,
  UltrasoundImagingService,
} from '../stories/scheduling';
import { buildElevatedBooking } from './buildElevatedBooking';
import {
  getRescheduleDurationMinutes,
  SchedulingRescheduledByOperationURI,
  SchedulingUnvalidatedRescheduleURI,
  writeElevatedReschedule,
} from './writeElevatedReschedule';

const START = new Date('2026-08-18T03:07:00.000Z');
const DURATION_MS = 2220123;

function proposal(schedules: WithId<Schedule>[] = [DrRiveraSchedule, ExamRoomBSchedule]): Appointment {
  return buildElevatedBooking({
    service: UltrasoundImagingService,
    schedules,
    start: START,
    durationMinutes: DURATION_MS / 60000,
  });
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
      end: '2026-08-18T15:30:00Z',
      created: '2026-01-01T00:00:00Z',
      comment: 'Keep this clinical detail',
      extension: [
        { url: 'https://example.org/metadata', valueString: 'keep' },
        { url: SchedulingBookedByOperationURI, valueString: '5.1.0' },
        { url: SchedulingRescheduledByOperationURI, valueString: '5.1.0' },
      ],
      participant: [
        ...RiveraImagingAppointment.participant.map((p) => ({ ...p, status: 'accepted' as const })),
        { actor: { reference: 'RelatedPerson/support-person' }, status: 'tentative' },
      ],
    });
  });

  test('updates the same appointment to the exact proposed length, preserving metadata and unscheduled actors', async () => {
    const update = vi.spyOn(medplum, 'updateResource');
    const original = structuredClone(existing);
    const result = await writeElevatedReschedule(medplum, existing, proposal());
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: existing.id }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'If-Match': `W/"${existing.meta?.versionId}"` }),
      })
    );
    for (const reference of existing.slot ?? []) {
      await expect(medplum.readReference(reference, { cache: 'no-cache' })).rejects.toThrow();
    }
    expect(result.appointments[0].slot?.map(getReferenceString)).toEqual(result.slots.map(getReferenceString));
    expect(result.appointments[0].id).toBe(existing.id);
    expect(Date.parse(result.appointments[0].end as string) - Date.parse(result.appointments[0].start as string)).toBe(
      DURATION_MS
    );
    const {
      start: _start,
      end: _end,
      slot: _slot,
      participant,
      meta: _meta,
      extension,
      ...unchanged
    } = result.appointments[0];
    expect(unchanged).toEqual(
      (({ start: _start, end: _end, slot: _slot, participant: _participant, meta: _meta, extension: _ext, ...rest }) =>
        rest)(existing)
    );
    expect(extension).toEqual([
      { url: 'https://example.org/metadata', valueString: 'keep' },
      { url: SchedulingBookedByOperationURI, valueString: '5.1.0' },
      { url: SchedulingUnvalidatedRescheduleURI, valueBoolean: true },
    ]);
    expect(participant).toContainEqual(
      expect.objectContaining(
        existing.participant.find((p) => p.actor?.reference === DrRiveraSchedule.actor[0].reference)
      )
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

  test('deduplicates actors shared by two schedules', async () => {
    const duplicate = await medplum.updateResource({ ...DrRiveraSchedule, id: 'same-provider-another-schedule' });
    const result = await writeElevatedReschedule(medplum, existing, proposal([DrRiveraSchedule, duplicate]));
    expect(
      result.appointments[0].participant.filter((p) => p.actor?.reference === DrRiveraSchedule.actor[0].reference)
    ).toHaveLength(1);
  });

  test('marks the first provider among the new schedules as primary, as $reschedule does', async () => {
    const result = await writeElevatedReschedule(medplum, existing, proposal([ExamRoomBSchedule, DrRiveraSchedule]));
    expect(getPrimaryProvider(result.appointments[0])).toEqual(DrRiveraSchedule.actor[0]);
    expect(result.appointments[0].participant.filter((p) => p.type?.length)).toHaveLength(1);
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
    const pending = await medplum.updateResource({ ...existing, status: 'pending' });
    const result = await writeElevatedReschedule(medplum, pending, proposal());
    expect(result.appointments[0].status).toBe('pending');
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

  test('moves the stored appointment rather than a stale copy', async () => {
    await medplum.updateResource({ ...existing, comment: 'Edited elsewhere' });
    const result = await writeElevatedReschedule(medplum, existing, proposal());
    expect(result.appointments[0].comment).toBe('Edited elsewhere');
  });

  test('refuses a proposal without a valid length', async () => {
    const create = vi.spyOn(medplum, 'createResource');
    await expect(writeElevatedReschedule(medplum, existing, { ...proposal(), end: undefined })).rejects.toThrow(
      'length'
    );
    expect(create).not.toHaveBeenCalled();
  });

  test.each([
    { active: false },
    { serviceType: [] },
    { actor: [...ExamRoomBSchedule.actor, ...DrRiveraSchedule.actor] },
  ])('rejects structurally ineligible schedules (%s)', async (override) => {
    await medplum.updateResource({ ...ExamRoomBSchedule, ...override });
    const create = vi.spyOn(medplum, 'createResource');
    await expect(writeElevatedReschedule(medplum, existing, proposal())).rejects.toThrow(
      'Every selected schedule must'
    );
    expect(create).not.toHaveBeenCalled();
  });

  describe('when a write fails', () => {
    /**
     * Records the id of every Slot the writer creates, optionally refusing one.
     * @param refuseCall - The 1-based createResource call to reject, if any.
     * @returns The ids of the Slots that were created.
     */
    function recordCreatedSlots(refuseCall?: number): string[] {
      const created: string[] = [];
      const createResource = medplum.createResource.bind(medplum);
      let calls = 0;
      vi.spyOn(medplum, 'createResource').mockImplementation(async (resource, options) => {
        calls++;
        if (calls === refuseCall) {
          throw new Error('Slot refused');
        }
        const result = await createResource(resource, options);
        created.push(result.id);
        return result;
      });
      return created;
    }

    async function expectUntouched(appointment = existing): Promise<void> {
      expect(await medplum.readResource('Appointment', existing.id, { cache: 'no-cache' })).toEqual(appointment);
      for (const slot of RiveraImagingHeldSlots) {
        await expect(medplum.readResource('Slot', slot.id, { cache: 'no-cache' })).resolves.toMatchObject({
          id: slot.id,
        });
      }
    }

    test('deletes the Slots it created when another Slot is refused', async () => {
      const created = recordCreatedSlots(2);
      await expect(writeElevatedReschedule(medplum, existing, proposal())).rejects.toThrow('Slot refused');
      expect(created).toHaveLength(1);
      await expect(medplum.readResource('Slot', created[0], { cache: 'no-cache' })).rejects.toThrow();
      await expectUntouched();
    });

    test('deletes the new Slots when another edit lands before the appointment update', async () => {
      const created = recordCreatedSlots();
      let concurrent: WithId<Appointment> | undefined;
      const readResource = medplum.readResource.bind(medplum);
      vi.spyOn(medplum, 'readResource').mockImplementationOnce((async (resourceType, id, options) => {
        const read = await readResource(resourceType, id, options);
        concurrent = await medplum.updateResource({ ...existing, comment: 'Edited concurrently' });
        return read;
      }) as MockClient['readResource']);
      await expect(writeElevatedReschedule(medplum, existing, proposal())).rejects.toThrow('Precondition Failed');
      expect(created).toHaveLength(2);
      for (const id of created) {
        await expect(medplum.readResource('Slot', id, { cache: 'no-cache' })).rejects.toThrow();
      }
      await expectUntouched(concurrent);
    });

    test('completes the move and logs old Slots it could not delete', async () => {
      const deleteResource = medplum.deleteResource.bind(medplum);
      const [refused] = RiveraImagingHeldSlots;
      vi.spyOn(medplum, 'deleteResource').mockImplementation(async (resourceType, id, options) => {
        if (id === refused.id) {
          throw new Error('Delete refused');
        }
        return deleteResource(resourceType, id, options);
      });
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const result = await writeElevatedReschedule(medplum, existing, proposal());
      expect(result.appointments[0].start).toBe(START.toISOString());
      await expect(medplum.readResource('Slot', refused.id, { cache: 'no-cache' })).resolves.toMatchObject({
        id: refused.id,
      });
      expect(log).toHaveBeenCalledWith(`Could not delete Slot/${refused.id}`, expect.any(Error));
    });
  });
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

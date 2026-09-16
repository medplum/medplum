// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { setScheduleParameter } from '@medplum/core';
import type { Schedule, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { DrRiveraSchedule, UltrasoundImagingService } from '../stories/scheduling';
import type { ScheduleCandidate } from './AppointmentFinder.schedules';
import { describeConflict, findBookingConflicts } from './findConflicts';

const START = new Date('2026-08-17T14:00:00.000Z');
const END = new Date('2026-08-17T14:30:00.000Z');

function candidate(schedule: WithId<Schedule>): ScheduleCandidate {
  return { schedule, actorResource: undefined };
}

function slot(start: string, end: string, status: Slot['status']): Slot {
  return {
    resourceType: 'Slot',
    schedule: { reference: `Schedule/${DrRiveraSchedule.id}` },
    start,
    end,
    status,
  };
}

describe('findBookingConflicts', () => {
  let medplum: MockClient;
  let found: Slot[];

  beforeEach(() => {
    medplum = new MockClient();
    found = [];
    // Stubbed rather than seeded: what is under test is how overlaps are classified,
    // not whether the mock repository implements `_filter` the way the server does.
    vi.spyOn(medplum, 'searchResources').mockImplementation(
      (async () => found) as unknown as MedplumClient['searchResources']
    );
  });

  async function conflicts(
    schedule: WithId<Schedule> = DrRiveraSchedule
  ): Promise<ReturnType<typeof describeConflict>[]> {
    const result = await findBookingConflicts({
      medplum,
      service: UltrasoundImagingService,
      candidates: [candidate(schedule)],
      start: START,
      end: END,
    });
    return result.map(describeConflict);
  }

  test('says nothing when the time is clear', async () => {
    await expect(conflicts()).resolves.toEqual([]);
  });

  test('names whose schedule an existing appointment is on', async () => {
    found = [slot('2026-08-17T14:15:00.000Z', '2026-08-17T14:45:00.000Z', 'busy')];
    await expect(conflicts()).resolves.toEqual(["Overlaps an existing appointment on Dr. Maya Rivera's schedule"]);
  });

  test('reads blocked time differently from a booked visit', async () => {
    found = [slot('2026-08-17T14:00:00.000Z', '2026-08-17T15:00:00.000Z', 'busy-unavailable')];
    await expect(conflicts()).resolves.toEqual(["Overlaps blocked time on Dr. Maya Rivera's schedule"]);
  });

  test('ignores a slot that only abuts the visit', async () => {
    // Ends exactly as the visit starts, so nothing is actually shared.
    found = [slot('2026-08-17T13:30:00.000Z', '2026-08-17T14:00:00.000Z', 'busy')];
    await expect(conflicts()).resolves.toEqual([]);
  });

  test('ignores time offered as free', async () => {
    found = [slot('2026-08-17T14:00:00.000Z', '2026-08-17T14:30:00.000Z', 'free')];
    await expect(conflicts()).resolves.toEqual([]);
  });

  describe('on a schedule that overbooks', () => {
    const capacity3 = setScheduleParameter(DrRiveraSchedule, UltrasoundImagingService, {
      url: 'slotCapacity',
      valuePositiveInt: 3,
    }) as WithId<Schedule>;

    test('stays quiet while there is still room', async () => {
      found = [
        slot('2026-08-17T14:00:00.000Z', '2026-08-17T14:30:00.000Z', 'busy'),
        slot('2026-08-17T14:00:00.000Z', '2026-08-17T14:30:00.000Z', 'busy'),
      ];
      // Warning on the first of three would cry wolf on every second booking.
      await expect(conflicts(capacity3)).resolves.toEqual([]);
    });

    test('warns once the capacity is used up', async () => {
      found = [
        slot('2026-08-17T14:00:00.000Z', '2026-08-17T14:30:00.000Z', 'busy'),
        slot('2026-08-17T14:00:00.000Z', '2026-08-17T14:30:00.000Z', 'busy'),
        slot('2026-08-17T14:00:00.000Z', '2026-08-17T14:30:00.000Z', 'busy'),
      ];
      await expect(conflicts(capacity3)).resolves.toEqual([
        "Overlaps an existing appointment on Dr. Maya Rivera's schedule",
      ]);
    });

    test('still warns about blocked time, which capacity never covers', async () => {
      found = [slot('2026-08-17T14:00:00.000Z', '2026-08-17T14:30:00.000Z', 'busy-unavailable')];
      // The server holds buffers and blocks to one occupant whatever the capacity.
      await expect(conflicts(capacity3)).resolves.toEqual(["Overlaps blocked time on Dr. Maya Rivera's schedule"]);
    });
  });
});

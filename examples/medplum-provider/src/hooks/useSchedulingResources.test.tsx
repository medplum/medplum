// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { QueryTypes, WithId } from '@medplum/core';
import { getQueryString } from '@medplum/core';
import type { Appointment, ResourceType, Schedule, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Range } from '../types/scheduling';
import { showErrorNotification } from '../utils/notifications';
import { useSchedulingAppointments, useSchedulingResources, useSchedulingSlots } from './useSchedulingResources';

// Mock the notification helper so error-path tests can assert on it without a
// Mantine <Notifications> provider.
vi.mock('../utils/notifications', () => ({
  showErrorNotification: vi.fn(),
}));

const SCHEDULE_A: WithId<Schedule> = {
  resourceType: 'Schedule',
  id: 'schedule-a',
  actor: [{ reference: 'Practitioner/pract-a' }],
};
const SCHEDULE_B: WithId<Schedule> = {
  resourceType: 'Schedule',
  id: 'schedule-b',
  actor: [{ reference: 'Practitioner/pract-b' }],
};
const SCHEDULE_C: WithId<Schedule> = {
  resourceType: 'Schedule',
  id: 'schedule-c',
  actor: [{ reference: 'Practitioner/pract-c' }],
};
const RANGE: Range = {
  start: new Date('2024-01-01T00:00:00.000Z'),
  end: new Date('2024-01-31T00:00:00.000Z'),
};

const slotA: WithId<Slot> = {
  resourceType: 'Slot',
  id: 'slot-a',
  schedule: { reference: 'Schedule/schedule-a' },
  status: 'free',
  start: '2024-01-15T10:00:00.000Z',
  end: '2024-01-15T10:30:00.000Z',
};
const slotB: WithId<Slot> = {
  resourceType: 'Slot',
  id: 'slot-b',
  schedule: { reference: 'Schedule/schedule-b' },
  status: 'free',
  start: '2024-01-16T10:00:00.000Z',
  end: '2024-01-16T10:30:00.000Z',
};

const apptA: WithId<Appointment> = {
  resourceType: 'Appointment',
  id: 'appt-a',
  status: 'booked',
  participant: [{ actor: { reference: 'Practitioner/pract-a' }, status: 'accepted' }],
};
const apptB: WithId<Appointment> = {
  resourceType: 'Appointment',
  id: 'appt-b',
  status: 'booked',
  participant: [{ actor: { reference: 'Practitioner/pract-b' }, status: 'accepted' }],
};

let medplum: MockClient;

beforeEach(() => {
  medplum = new MockClient();
  vi.clearAllMocks();
});

const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
  <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
);

// Render any of the scheduling hooks with the shared provider, keeping `schedules`
// and `range` as rerender-able props.
function setup<T>(
  hook: (schedules: WithId<Schedule>[], range: Range | undefined) => T,
  schedules: WithId<Schedule>[],
  range: Range | undefined
): ReturnType<typeof renderHook<T, { schedules: WithId<Schedule>[]; range: Range | undefined }>> {
  return renderHook(({ schedules, range }) => hook(schedules, range), {
    wrapper,
    initialProps: { schedules, range },
  });
}

// Stub `searchResources` to return per-schedule Slots and per-actor Appointments.
// Returns an object keyed by ResourceType with a URLSearchParams entry for each
// invocation of that type.
function configureSearch(options: {
  slotsBySchedule?: Record<string, WithId<Slot>[]>;
  appointmentsByActor?: Record<string, WithId<Appointment>[]>;
}): Partial<Record<ResourceType, URLSearchParams[]>> {
  const { slotsBySchedule = {}, appointmentsByActor = {} } = options;
  const callsByResourceType: Partial<Record<ResourceType, URLSearchParams[]>> = {};
  const mock = vi.fn().mockImplementation((resourceType: ResourceType, query: QueryTypes) => {
    const params = new URLSearchParams(getQueryString(query));
    callsByResourceType[resourceType] ??= [];
    callsByResourceType[resourceType].push(params);
    if (resourceType === 'Slot') {
      const ref = params.get('schedule');
      return Promise.resolve(ref ? (slotsBySchedule[ref] ?? []) : []);
    }
    if (resourceType === 'Appointment') {
      const ref = params.get('actor');
      return Promise.resolve(ref ? (appointmentsByActor[ref] ?? []) : []);
    }
    return Promise.resolve([]);
  });
  medplum.searchResources = mock;
  return callsByResourceType;
}

describe('useSchedulingSlots', () => {
  describe('fetching', () => {
    test('does not search when the range is undefined', () => {
      medplum.searchResources = vi.fn();

      const { result } = setup(useSchedulingSlots, [SCHEDULE_A], undefined);

      expect(medplum.searchResources).not.toHaveBeenCalled();
      expect(result.current.slots).toBeUndefined();
      expect(result.current.loading).toBe(false);
    });

    test('searches slots for a single schedule', async () => {
      const searches = configureSearch({ slotsBySchedule: { 'Schedule/schedule-a': [slotA] } });

      const { result } = setup(useSchedulingSlots, [SCHEDULE_A], RANGE);

      await waitFor(() => expect(result.current.slots).toEqual([slotA]));

      // One Slot query scoped to the schedule, bounded by the range.
      expect(searches['Slot']).toHaveLength(1);
      expect(searches['Slot']?.[0].toString()).toEqual(
        getQueryString([
          ['_count', '1000'],
          ['schedule', 'Schedule/schedule-a'],
          ['start', `ge${RANGE.start.toISOString()}`],
          ['start', `le${RANGE.end.toISOString()}`],
          ['status:not', 'entered-in-error'],
        ])
      );
    });

    test('emits one Slot query per schedule and merges the results', async () => {
      const searches = configureSearch({
        slotsBySchedule: { 'Schedule/schedule-a': [slotA], 'Schedule/schedule-b': [slotB] },
      });

      const { result } = setup(useSchedulingSlots, [SCHEDULE_A, SCHEDULE_B], RANGE);

      await waitFor(() => expect(result.current.slots).toHaveLength(2));

      expect(searches['Slot']).toHaveLength(2);
      expect(searches['Slot']?.map((params) => params.get('schedule'))).toEqual(
        expect.arrayContaining(['Schedule/schedule-a', 'Schedule/schedule-b'])
      );
      expect(result.current.slots).toEqual(expect.arrayContaining([slotA, slotB]));
    });

    test('dedupes duplicate schedule references into a single Slot query', async () => {
      const searches = configureSearch({ slotsBySchedule: { 'Schedule/schedule-a': [slotA] } });

      const { result } = setup(useSchedulingSlots, [SCHEDULE_A, SCHEDULE_A], RANGE);

      await waitFor(() => expect(result.current.slots).toEqual([slotA]));

      expect(searches['Slot']).toHaveLength(1);
    });

    test('reports errors and stops loading when a search fails', async () => {
      medplum.searchResources = vi.fn().mockRejectedValue(new Error('boom'));

      const { result } = setup(useSchedulingSlots, [SCHEDULE_A], RANGE);

      await waitFor(() => expect(vi.mocked(showErrorNotification)).toHaveBeenCalled());
      await waitFor(() => expect(result.current.loading).toBe(false));
    });

    test('searches are not triggered by unstable wrappers', async () => {
      medplum.searchResources = vi.fn();
      const { rerender } = await act(async () => setup(useSchedulingSlots, [SCHEDULE_A, SCHEDULE_B], { ...RANGE }));

      // one search per schedule emitted
      expect(medplum.searchResources).toHaveBeenCalledTimes(2);

      // re-render with the same objects in new outer wrapping list/objects
      await act(() => rerender({ schedules: [SCHEDULE_A, SCHEDULE_B], range: { ...RANGE } }));

      // no new searches emitted
      expect(medplum.searchResources).toHaveBeenCalledTimes(2);

      // re-render with a new schedule added
      await act(() => rerender({ schedules: [SCHEDULE_A, SCHEDULE_B, SCHEDULE_C], range: { ...RANGE } }));

      // effect re-runs search for each schedule
      expect(medplum.searchResources).toHaveBeenCalledTimes(5);

      // re-render with a range change
      const newRange = {
        start: new Date('2024-01-07T00:00:00.000Z'),
        end: new Date('2024-01-14T00:00:00.000Z'),
      };
      await act(() => rerender({ schedules: [SCHEDULE_A, SCHEDULE_B, SCHEDULE_C], range: { ...newRange } }));

      // effect re-runs search for each schedule
      expect(medplum.searchResources).toHaveBeenCalledTimes(8);

      // re-render with same range but new `Date` instances
      await act(() =>
        rerender({
          schedules: [SCHEDULE_A, SCHEDULE_B, SCHEDULE_C],
          range: {
            start: new Date('2024-01-07T00:00:00.000Z'),
            end: new Date('2024-01-14T00:00:00.000Z'),
          },
        })
      );

      // no new searches run
      expect(medplum.searchResources).toHaveBeenCalledTimes(8);
    });
  });

  describe('loading', () => {
    test('is false when there is no range', () => {
      const { result } = setup(useSchedulingSlots, [SCHEDULE_A], undefined);
      expect(result.current.loading).toBe(false);
    });

    test('is true while a fetch is in progress and false once it settles', async () => {
      // A promise we hold open to keep the fetch in flight while asserting `loading`.
      const gate = Promise.withResolvers<WithId<Slot>[]>();
      medplum.searchResources = vi.fn().mockReturnValue(gate.promise);

      const { result } = setup(useSchedulingSlots, [SCHEDULE_A], RANGE);

      await waitFor(() => expect(result.current.loading).toBe(true));

      await act(async () => {
        gate.resolve([]);
      });

      expect(result.current.loading).toBe(false);
    });

    test('clears loading when the range is cleared before the fetch settles', async () => {
      // A search that never resolves keeps the fetch in flight.
      medplum.searchResources = vi.fn().mockReturnValue(new Promise<WithId<Slot>[]>(() => {}));

      const { result, rerender } = setup(useSchedulingSlots, [SCHEDULE_A], RANGE);

      await waitFor(() => expect(result.current.loading).toBe(true));

      rerender({ schedules: [SCHEDULE_A], range: undefined });

      await waitFor(() => expect(result.current.loading).toBe(false));
    });
  });

  describe('live updates from useResourceModified', () => {
    test('prepends a created Slot that belongs to a tracked schedule', async () => {
      configureSearch({ slotsBySchedule: { 'Schedule/schedule-a': [slotA] } });
      const { result } = setup(useSchedulingSlots, [SCHEDULE_A], RANGE);
      await waitFor(() => expect(result.current.slots).toEqual([slotA]));

      const created: WithId<Slot> = { ...slotA, id: 'slot-new' };
      act(() => {
        medplum.notifyResourceModified({
          resourceType: 'Slot',
          operation: 'create',
          id: created.id,
          resource: created,
        });
      });

      expect(result.current.slots).toEqual([slotA, created]);
    });

    test('ignores a created Slot for an untracked schedule', async () => {
      configureSearch({ slotsBySchedule: { 'Schedule/schedule-a': [slotA] } });
      const { result } = setup(useSchedulingSlots, [SCHEDULE_A], RANGE);
      await waitFor(() => expect(result.current.slots).toEqual([slotA]));

      const foreign: WithId<Slot> = { ...slotA, id: 'slot-foreign', schedule: { reference: 'Schedule/other' } };
      act(() => {
        medplum.notifyResourceModified({
          resourceType: 'Slot',
          operation: 'create',
          id: foreign.id,
          resource: foreign,
        });
      });

      expect(result.current.slots).toEqual([slotA]);
    });

    test('replaces an updated Slot in place', async () => {
      configureSearch({ slotsBySchedule: { 'Schedule/schedule-a': [slotA] } });
      const { result } = setup(useSchedulingSlots, [SCHEDULE_A], RANGE);
      await waitFor(() => expect(result.current.slots).toEqual([slotA]));

      const updated: WithId<Slot> = { ...slotA, status: 'busy' };
      act(() => {
        medplum.notifyResourceModified({
          resourceType: 'Slot',
          operation: 'update',
          id: updated.id,
          resource: updated,
        });
      });

      expect(result.current.slots).toEqual([updated]);
    });

    test('removes a deleted Slot by id', async () => {
      configureSearch({ slotsBySchedule: { 'Schedule/schedule-a': [slotA] } });
      const { result } = setup(useSchedulingSlots, [SCHEDULE_A], RANGE);
      await waitFor(() => expect(result.current.slots).toEqual([slotA]));

      act(() => {
        medplum.notifyResourceModified({ resourceType: 'Slot', operation: 'delete', id: slotA.id });
      });

      expect(result.current.slots).toEqual([]);
    });
  });
});

describe('useSchedulingAppointments', () => {
  describe('fetching', () => {
    test('does not search when the range is undefined', () => {
      medplum.searchResources = vi.fn();

      const { result } = setup(useSchedulingAppointments, [SCHEDULE_A], undefined);

      expect(medplum.searchResources).not.toHaveBeenCalled();
      expect(result.current.appointments).toBeUndefined();
      expect(result.current.loading).toBe(false);
    });

    test('does not search when no schedule has an actor', () => {
      medplum.searchResources = vi.fn();
      const actorless: WithId<Schedule> = { resourceType: 'Schedule', id: 'schedule-actorless', actor: [] };

      const { result } = setup(useSchedulingAppointments, [actorless], RANGE);

      expect(medplum.searchResources).not.toHaveBeenCalled();
      expect(result.current.appointments).toBeUndefined();
      expect(result.current.loading).toBe(false);
    });

    test('searches appointments for a single schedule', async () => {
      const searches = configureSearch({ appointmentsByActor: { 'Practitioner/pract-a': [apptA] } });

      const { result } = setup(useSchedulingAppointments, [SCHEDULE_A], RANGE);

      await waitFor(() => expect(result.current.appointments).toEqual([apptA]));

      // One Appointment query scoped to the schedule's actor, bounded by the range.
      expect(searches['Appointment']).toHaveLength(1);
      expect(searches['Appointment']?.[0].toString()).toEqual(
        getQueryString([
          ['_count', '1000'],
          ['actor', 'Practitioner/pract-a'],
          ['date', `ge${RANGE.start.toISOString()}`],
          ['date', `le${RANGE.end.toISOString()}`],
        ])
      );
    });

    test('emits one Appointment query per schedule actor and merges the results', async () => {
      const searches = configureSearch({
        appointmentsByActor: { 'Practitioner/pract-a': [apptA], 'Practitioner/pract-b': [apptB] },
      });

      const { result } = setup(useSchedulingAppointments, [SCHEDULE_A, SCHEDULE_B], RANGE);

      await waitFor(() => expect(result.current.appointments).toHaveLength(2));

      expect(searches['Appointment']).toHaveLength(2);
      expect(result.current.appointments).toEqual(expect.arrayContaining([apptA, apptB]));
    });

    test('dedupes schedules that share an actor into a single Appointment query', async () => {
      const scheduleC: WithId<Schedule> = {
        resourceType: 'Schedule',
        id: 'schedule-c',
        actor: [{ reference: 'Practitioner/shared' }],
      };
      const scheduleD: WithId<Schedule> = {
        resourceType: 'Schedule',
        id: 'schedule-d',
        actor: [{ reference: 'Practitioner/shared' }],
      };
      const searches = configureSearch({ appointmentsByActor: { 'Practitioner/shared': [apptA] } });

      const { result } = setup(useSchedulingAppointments, [scheduleC, scheduleD], RANGE);

      await waitFor(() => expect(result.current.appointments).toEqual([apptA]));

      // The shared actor is only queried once.
      expect(searches['Appointment']).toHaveLength(1);
    });

    test('dedupes an appointment returned for more than one schedule', async () => {
      const shared: WithId<Appointment> = {
        resourceType: 'Appointment',
        id: 'appt-shared',
        status: 'booked',
        participant: [
          { actor: { reference: 'Practitioner/pract-a' }, status: 'accepted' },
          { actor: { reference: 'Practitioner/pract-b' }, status: 'accepted' },
        ],
      };
      const searches = configureSearch({
        appointmentsByActor: { 'Practitioner/pract-a': [shared], 'Practitioner/pract-b': [shared] },
      });

      const { result } = setup(useSchedulingAppointments, [SCHEDULE_A, SCHEDULE_B], RANGE);

      await waitFor(() => expect(result.current.appointments).toBeDefined());

      expect(searches['Appointment']).toHaveLength(2);
      expect(result.current.appointments).toEqual([shared]);
    });

    test('reports errors and stops loading when a search fails', async () => {
      medplum.searchResources = vi.fn().mockRejectedValue(new Error('boom'));

      const { result } = setup(useSchedulingAppointments, [SCHEDULE_A], RANGE);

      await waitFor(() => expect(vi.mocked(showErrorNotification)).toHaveBeenCalled());
      await waitFor(() => expect(result.current.loading).toBe(false));
    });

    test('searches are not triggered by unstable wrappers', async () => {
      medplum.searchResources = vi.fn();
      const { rerender } = await act(async () =>
        setup(useSchedulingAppointments, [SCHEDULE_A, SCHEDULE_B], { ...RANGE })
      );

      // one search per schedule.actor emitted
      expect(medplum.searchResources).toHaveBeenCalledTimes(2);

      // re-render with the same objects in new outer wrapping list/objects
      await act(() => rerender({ schedules: [SCHEDULE_A, SCHEDULE_B], range: { ...RANGE } }));

      // no new searches emitted
      expect(medplum.searchResources).toHaveBeenCalledTimes(2);

      // re-render with a new schedule added
      await act(() => rerender({ schedules: [SCHEDULE_A, SCHEDULE_B, SCHEDULE_C], range: { ...RANGE } }));

      // effect re-runs search for each schedule
      expect(medplum.searchResources).toHaveBeenCalledTimes(5);

      // re-render with a range change
      const newRange = {
        start: new Date('2024-01-07T00:00:00.000Z'),
        end: new Date('2024-01-14T00:00:00.000Z'),
      };
      await act(() => rerender({ schedules: [SCHEDULE_A, SCHEDULE_B, SCHEDULE_C], range: { ...newRange } }));

      // effect re-runs search for each schedule
      expect(medplum.searchResources).toHaveBeenCalledTimes(8);

      // re-render with same range but new `Date` instances
      await act(() =>
        rerender({
          schedules: [SCHEDULE_A, SCHEDULE_B, SCHEDULE_C],
          range: {
            start: new Date('2024-01-07T00:00:00.000Z'),
            end: new Date('2024-01-14T00:00:00.000Z'),
          },
        })
      );

      // no new searches run
      expect(medplum.searchResources).toHaveBeenCalledTimes(8);
    });
  });

  describe('loading', () => {
    test('is false when there is no range', () => {
      const { result } = setup(useSchedulingAppointments, [SCHEDULE_A], undefined);
      expect(result.current.loading).toBe(false);
    });

    test('is true while a fetch is in progress and false once it settles', async () => {
      // A promise we hold open to keep the fetch in flight while asserting `loading`.
      const gate = Promise.withResolvers<WithId<Appointment>[]>();
      medplum.searchResources = vi.fn().mockReturnValue(gate.promise);

      const { result } = setup(useSchedulingAppointments, [SCHEDULE_A], RANGE);

      await waitFor(() => expect(result.current.loading).toBe(true));

      await act(async () => {
        gate.resolve([]);
      });

      expect(result.current.loading).toBe(false);
    });

    test('clears loading when the range is cleared before the fetch settles', async () => {
      // A search that never resolves keeps the fetch in flight.
      medplum.searchResources = vi.fn().mockReturnValue(new Promise<WithId<Appointment>[]>(() => {}));

      const { result, rerender } = setup(useSchedulingAppointments, [SCHEDULE_A], RANGE);

      await waitFor(() => expect(result.current.loading).toBe(true));

      rerender({ schedules: [SCHEDULE_A], range: undefined });

      await waitFor(() => expect(result.current.loading).toBe(false));
    });
  });

  describe('live updates from useResourceModified', () => {
    test('appends a created Appointment when its actor matches a schedule', async () => {
      configureSearch({ appointmentsByActor: { 'Practitioner/pract-a': [apptA] } });
      const { result } = setup(useSchedulingAppointments, [SCHEDULE_A], RANGE);
      await waitFor(() => expect(result.current.appointments).toEqual([apptA]));

      const created: WithId<Appointment> = {
        resourceType: 'Appointment',
        id: 'appt-new',
        status: 'booked',
        participant: [{ actor: { reference: 'Practitioner/pract-a' }, status: 'accepted' }],
      };
      act(() => {
        medplum.notifyResourceModified({
          resourceType: 'Appointment',
          operation: 'create',
          id: created.id,
          resource: created,
        });
      });

      expect(result.current.appointments).toEqual([apptA, created]);
    });

    test('ignores a created Appointment whose actor is not tracked', async () => {
      configureSearch({ appointmentsByActor: { 'Practitioner/pract-a': [apptA] } });
      const { result } = setup(useSchedulingAppointments, [SCHEDULE_A], RANGE);
      await waitFor(() => expect(result.current.appointments).toEqual([apptA]));

      const foreign: WithId<Appointment> = {
        resourceType: 'Appointment',
        id: 'appt-foreign',
        status: 'booked',
        participant: [{ actor: { reference: 'Practitioner/stranger' }, status: 'accepted' }],
      };
      act(() => {
        medplum.notifyResourceModified({
          resourceType: 'Appointment',
          operation: 'create',
          id: foreign.id,
          resource: foreign,
        });
      });

      expect(result.current.appointments).toEqual([apptA]);
    });

    test('replaces an updated Appointment in place', async () => {
      configureSearch({ appointmentsByActor: { 'Practitioner/pract-a': [apptA] } });
      const { result } = setup(useSchedulingAppointments, [SCHEDULE_A], RANGE);
      await waitFor(() => expect(result.current.appointments).toEqual([apptA]));

      const updated: WithId<Appointment> = { ...apptA, status: 'cancelled' };
      act(() => {
        medplum.notifyResourceModified({
          resourceType: 'Appointment',
          operation: 'update',
          id: updated.id,
          resource: updated,
        });
      });

      expect(result.current.appointments).toEqual([updated]);
    });

    test('removes a deleted Appointment by id', async () => {
      configureSearch({ appointmentsByActor: { 'Practitioner/pract-a': [apptA] } });
      const { result } = setup(useSchedulingAppointments, [SCHEDULE_A], RANGE);
      await waitFor(() => expect(result.current.appointments).toEqual([apptA]));

      act(() => {
        medplum.notifyResourceModified({ resourceType: 'Appointment', operation: 'delete', id: apptA.id });
      });

      expect(result.current.appointments).toEqual([]);
    });
  });
});

describe('useSchedulingResources', () => {
  test('combines slots and appointments from both hooks', async () => {
    configureSearch({
      slotsBySchedule: { 'Schedule/schedule-a': [slotA] },
      appointmentsByActor: { 'Practitioner/pract-a': [apptA] },
    });

    const { result } = setup(useSchedulingResources, [SCHEDULE_A], RANGE);

    await waitFor(() => {
      expect(result.current.slots).toEqual([slotA]);
      expect(result.current.appointments).toEqual([apptA]);
    });
  });

  test('stays loading until both the slot and appointment fetches settle', async () => {
    // Slots resolve immediately; appointments stay in flight behind the gate.
    const gate = Promise.withResolvers<WithId<Appointment>[]>();
    medplum.searchResources = vi.fn().mockImplementation((resourceType: ResourceType) => {
      return resourceType === 'Appointment' ? gate.promise : Promise.resolve([]);
    });

    const { result } = setup(useSchedulingResources, [SCHEDULE_A], RANGE);

    await waitFor(() => expect(result.current.loading).toBe(true));

    // With slots done but appointments still pending, the combined flag stays true.
    expect(result.current.loading).toBe(true);

    await act(async () => {
      gate.resolve([]);
    });

    expect(result.current.loading).toBe(false);
  });
});

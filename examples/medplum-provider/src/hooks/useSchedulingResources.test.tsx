// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ReadablePromise } from '@medplum/core';
import type { Appointment, Bundle, HealthcareService, Schedule, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type { RenderHookResult } from '@testing-library/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SchedulingTransientIdentifier } from '../utils/scheduling';
import type { UseSchedulingResourcesResult } from './useSchedulingResources';
import { useSchedulingResources } from './useSchedulingResources';

describe('useSchedulingResources', () => {
  let medplum: MockClient;

  const schedule: WithId<Schedule> = {
    resourceType: 'Schedule',
    id: 'schedule-1',
    actor: [{ reference: 'Practitioner/prac-1' }],
    active: true,
  };

  // Stable array reference — passing [schedule] inline to renderHook creates a new array on every
  // render, which causes the useEffect to re-run on each render (infinite loop).
  const schedules = [schedule];

  const range = {
    start: new Date('2024-01-15T00:00:00Z'),
    end: new Date('2024-01-21T23:59:59Z'),
  };

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );

  describe('initial state', () => {
    test('exposes schedulingAPI with all operations', () => {
      const { result } = renderHook(() => useSchedulingResources(schedules, undefined), { wrapper });

      expect(typeof result.current.schedulingAPI.book).toBe('function');
      expect(typeof result.current.schedulingAPI.cancel).toBe('function');
      expect(typeof result.current.schedulingAPI.confirm).toBe('function');
      expect(typeof result.current.schedulingAPI.find).toBe('function');
      expect(typeof result.current.schedulingAPI.updateAppointment).toBe('function');
    });

    test('slots and appointments are undefined when no range is provided', () => {
      const { result } = renderHook(() => useSchedulingResources(schedules, undefined), { wrapper });

      expect(result.current.slots).toBeUndefined();
      expect(result.current.appointments).toBeUndefined();
    });
  });

  describe('data fetching', () => {
    test('fetches slots and appointments when range is provided', async () => {
      const mockSlot: WithId<Slot> = {
        resourceType: 'Slot',
        id: 'slot-1',
        status: 'free',
        start: '2024-01-16T10:00:00Z',
        end: '2024-01-16T10:30:00Z',
        schedule: { reference: 'Schedule/schedule-1' },
      };
      const mockAppointment: WithId<Appointment> = {
        resourceType: 'Appointment',
        id: 'appt-1',
        status: 'booked',
        participant: [],
      };

      medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
        if (resourceType === 'Slot') {
          return Promise.resolve([mockSlot]);
        }
        if (resourceType === 'Appointment') {
          return Promise.resolve([mockAppointment]);
        }
        return Promise.resolve([]);
      });

      const { result } = renderHook(() => useSchedulingResources(schedules, range), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.slots).toEqual([mockSlot]);
      expect(result.current.appointments).toEqual([mockAppointment]);
    });

    test('searches slots with correct schedule reference and date range', async () => {
      const searchMock = vi.fn().mockResolvedValue([]);
      medplum.searchResources = searchMock;

      const { result } = renderHook(() => useSchedulingResources(schedules, range), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const slotCall = searchMock.mock.calls.find((args: unknown[]) => args[0] === 'Slot');
      expect(slotCall).toBeDefined();
      if (!slotCall) {
        return;
      }
      const [, slotParams] = slotCall;
      expect(slotParams).toContainEqual(['schedule', 'Schedule/schedule-1']);
      expect(slotParams).toContainEqual(['start', `ge${range.start.toISOString()}`]);
      expect(slotParams).toContainEqual(['status:not', 'entered-in-error']);
    });

    test('searches appointments with actor references and date range', async () => {
      medplum.searchResources = vi.fn().mockResolvedValue([]);

      const { result } = renderHook(() => useSchedulingResources(schedules, range), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const apptCall = (medplum.searchResources as ReturnType<typeof vi.fn>).mock.calls.find(
        (args: unknown[]) => args[0] === 'Appointment'
      );
      expect(apptCall).toBeDefined();
      if (!apptCall) {
        return;
      }
      const [, apptParams] = apptCall;
      expect(apptParams).toContainEqual(['actor', 'Practitioner/prac-1']);
      expect(apptParams).toContainEqual(['date', `ge${range.start.toISOString()}`]);
    });

    test('flattens slots and appointments across multiple schedules', async () => {
      const schedule2: WithId<Schedule> = {
        resourceType: 'Schedule',
        id: 'schedule-2',
        actor: [{ reference: 'Practitioner/prac-2' }],
        active: true,
      };

      const slot1: WithId<Slot> = {
        resourceType: 'Slot',
        id: 's1',
        status: 'free',
        start: '2024-01-16T10:00:00Z',
        end: '2024-01-16T10:30:00Z',
        schedule: { reference: 'Schedule/schedule-1' },
      };
      const slot2: WithId<Slot> = {
        resourceType: 'Slot',
        id: 's2',
        status: 'free',
        start: '2024-01-16T11:00:00Z',
        end: '2024-01-16T11:30:00Z',
        schedule: { reference: 'Schedule/schedule-2' },
      };

      let slotCallCount = 0;
      medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
        if (resourceType === 'Slot') {
          return Promise.resolve(slotCallCount++ === 0 ? [slot1] : [slot2]);
        }
        return Promise.resolve([]);
      });

      const schedules = [schedule, schedule2];
      const { result } = renderHook(() => useSchedulingResources(schedules, range), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.slots).toHaveLength(2);
      expect(result.current.slots).toContainEqual(slot1);
      expect(result.current.slots).toContainEqual(slot2);
    });

    test('sets warning operationOutcome when results hit the page size limit', async () => {
      const PAGE_SIZE = 1000;
      const slots: WithId<Slot>[] = Array.from({ length: PAGE_SIZE }, (_, i) => ({
        resourceType: 'Slot' as const,
        id: `slot-${i}`,
        status: 'free' as const,
        start: '2024-01-16T10:00:00Z',
        end: '2024-01-16T10:30:00Z',
        schedule: { reference: 'Schedule/schedule-1' },
      }));

      medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
        if (resourceType === 'Slot') {
          return Promise.resolve(slots);
        }
        return Promise.resolve([]);
      });

      const { result } = renderHook(() => useSchedulingResources(schedules, range), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.operationOutcome?.issue?.[0]?.code).toBe('incomplete');
    });

    test('sets error operationOutcome when fetch fails', async () => {
      medplum.searchResources = vi.fn().mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useSchedulingResources(schedules, range), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.operationOutcome).toBeDefined();
      expect(result.current.operationOutcome?.issue?.[0]?.severity).toBe('error');
    });
  });

  describe('book()', () => {
    const existingSlot: WithId<Slot> = {
      resourceType: 'Slot',
      id: 'existing-slot',
      status: 'free',
      start: '2024-01-16T09:00:00Z',
      end: '2024-01-16T09:30:00Z',
      schedule: { reference: 'Schedule/schedule-1' },
    };
    const existingAppointment: WithId<Appointment> = {
      resourceType: 'Appointment',
      id: 'existing-appt',
      status: 'booked',
      participant: [],
    };

    const setupWithData = async (): Promise<RenderHookResult<UseSchedulingResourcesResult, void>> => {
      medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
        if (resourceType === 'Slot') {
          return Promise.resolve([existingSlot]);
        }
        if (resourceType === 'Appointment') {
          return Promise.resolve([existingAppointment]);
        }
        return Promise.resolve([]);
      });

      const hookResult = renderHook(() => useSchedulingResources(schedules, range), { wrapper });
      await waitFor(() => expect(hookResult.result.current.loading).toBe(false));
      return hookResult;
    };

    test('calls POST on Appointment/$book with a Parameters resource', async () => {
      const { result } = await setupWithData();

      const newAppointment: WithId<Appointment> = {
        resourceType: 'Appointment',
        id: 'new-appt',
        status: 'booked',
        participant: [],
      };
      const bundle: Bundle = {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [{ resource: newAppointment }],
      };
      medplum.post = vi.fn().mockResolvedValue(bundle);
      medplum.invalidateSearches = vi.fn();

      await act(async () => {
        await result.current.schedulingAPI.book({ resourceType: 'Appointment', status: 'proposed', participant: [] });
      });

      expect(medplum.post).toHaveBeenCalledWith(
        expect.objectContaining({ href: expect.stringContaining('Appointment/$book') }),
        expect.objectContaining({ resourceType: 'Parameters' })
      );
    });

    test('removes SchedulingTransientIdentifier from appointment before posting', async () => {
      const { result } = await setupWithData();

      const newAppointment: WithId<Appointment> = {
        resourceType: 'Appointment',
        id: 'new-appt',
        status: 'booked',
        participant: [],
      };
      medplum.post = vi.fn().mockResolvedValue({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [{ resource: newAppointment }],
      });
      medplum.invalidateSearches = vi.fn();

      const appointmentWithId: Appointment = { resourceType: 'Appointment', status: 'proposed', participant: [] };
      SchedulingTransientIdentifier.set(appointmentWithId);
      expect(SchedulingTransientIdentifier.get(appointmentWithId)).toBeDefined();

      await act(async () => {
        await result.current.schedulingAPI.book(appointmentWithId);
      });

      const postCall = (medplum.post as ReturnType<typeof vi.fn>).mock.calls[0];
      const parameters = postCall[1];
      const postedAppointment = parameters.parameter[0].resource;
      expect(SchedulingTransientIdentifier.get(postedAppointment)).toBeUndefined();
    });

    test('adds booked appointment and slot to local state', async () => {
      const { result } = await setupWithData();

      const newAppointment: WithId<Appointment> = {
        resourceType: 'Appointment',
        id: 'new-appt',
        status: 'booked',
        participant: [
          {
            status: 'tentative',
            actor: { reference: 'Practitioner/prac-1' },
          },
        ],
      };
      const newSlot: WithId<Slot> = {
        resourceType: 'Slot',
        id: 'new-slot',
        status: 'busy',
        start: '2024-01-16T10:00:00Z',
        end: '2024-01-16T10:30:00Z',
        schedule: { reference: 'Schedule/schedule-1' },
      };
      medplum.post = vi.fn().mockResolvedValue({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [{ resource: newAppointment }, { resource: newSlot }],
      });
      medplum.invalidateSearches = vi.fn();

      // let bookResult!: { appointment: WithId<Appointment>; slots: WithId<Slot>[] };
      const bookResult = await act(() =>
        result.current.schedulingAPI.book({
          resourceType: 'Appointment',
          status: 'proposed',
          participant: [
            {
              status: 'tentative',
              actor: { reference: 'Practitioner/prac-1' },
            },
          ],
        })
      );

      expect(bookResult.appointment).toEqual(newAppointment);
      expect(bookResult.slots).toContainEqual(newSlot);
      expect(result.current.appointments).toContainEqual(newAppointment);
      expect(result.current.slots).toContainEqual(newSlot);
      expect(result.current.appointments).toContainEqual(existingAppointment);
      expect(result.current.slots).toContainEqual(existingSlot);
    });

    test('invalidates Appointment and Slot searches', async () => {
      const { result } = await setupWithData();

      const newAppointment: WithId<Appointment> = {
        resourceType: 'Appointment',
        id: 'new-appt',
        status: 'booked',
        participant: [
          {
            status: 'tentative',
            actor: { reference: 'Practitioner/prac-1' },
          },
        ],
      };
      medplum.post = vi.fn().mockResolvedValue({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [{ resource: newAppointment }],
      });
      medplum.invalidateSearches = vi.fn();

      await act(async () => {
        await result.current.schedulingAPI.book({
          resourceType: 'Appointment',
          status: 'proposed',
          participant: [
            {
              status: 'tentative',
              actor: { reference: 'Practitioner/prac-1' },
            },
          ],
        });
      });

      expect(medplum.invalidateSearches).toHaveBeenCalledWith('Appointment');
      expect(medplum.invalidateSearches).toHaveBeenCalledWith('Slot');
    });

    test('throws when $book returns no Appointment in the bundle', async () => {
      const { result } = await setupWithData();

      medplum.post = vi.fn().mockResolvedValue({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [],
      });
      medplum.invalidateSearches = vi.fn();

      await expect(
        act(async () => {
          await result.current.schedulingAPI.book({ resourceType: 'Appointment', status: 'proposed', participant: [] });
        })
      ).rejects.toThrow('$book succeeded but did not return an Appointment');
    });
  });

  describe('cancel()', () => {
    test('calls POST on Appointment/:id/$cancel, updates the appointment, and removes its slots', async () => {
      const slotToCancel: WithId<Slot> = {
        resourceType: 'Slot',
        id: 'slot-cancel',
        status: 'busy',
        start: '2024-01-16T10:00:00Z',
        end: '2024-01-16T10:30:00Z',
        schedule: { reference: 'Schedule/schedule-1' },
      };
      const otherSlot: WithId<Slot> = {
        resourceType: 'Slot',
        id: 'other-slot',
        status: 'free',
        start: '2024-01-16T11:00:00Z',
        end: '2024-01-16T11:30:00Z',
        schedule: { reference: 'Schedule/schedule-1' },
      };
      const appointmentToCancel: WithId<Appointment> = {
        resourceType: 'Appointment',
        id: 'appt-cancel',
        status: 'booked',
        participant: [],
        slot: [{ reference: 'Slot/slot-cancel' }],
      };

      medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
        if (resourceType === 'Slot') {
          return Promise.resolve([slotToCancel, otherSlot]);
        }
        if (resourceType === 'Appointment') {
          return Promise.resolve([appointmentToCancel]);
        }
        return Promise.resolve([]);
      });

      const { result } = renderHook(() => useSchedulingResources(schedules, range), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const cancelledAppointment: WithId<Appointment> = {
        ...appointmentToCancel,
        status: 'cancelled',
      };
      medplum.post = vi.fn().mockResolvedValue(cancelledAppointment);
      medplum.invalidateSearches = vi.fn();

      await act(async () => {
        await result.current.schedulingAPI.cancel(appointmentToCancel);
      });

      expect(medplum.post).toHaveBeenCalledWith(
        expect.objectContaining({ href: expect.stringContaining(`Appointment/appt-cancel/$cancel`) })
      );
      expect(result.current.appointments).toContainEqual(cancelledAppointment);
      expect(result.current.slots).not.toContainEqual(expect.objectContaining({ id: 'slot-cancel' }));
      expect(result.current.slots).toContainEqual(otherSlot);
    });
  });

  describe('confirm()', () => {
    test('calls POST on Appointment/:id/$confirm and updates appointment and slots in state', async () => {
      const pendingAppointment: WithId<Appointment> = {
        resourceType: 'Appointment',
        id: 'appt-pending',
        status: 'pending',
        participant: [],
      };
      const pendingSlot: WithId<Slot> = {
        resourceType: 'Slot',
        id: 'slot-pending',
        status: 'busy',
        start: '2024-01-16T10:00:00Z',
        end: '2024-01-16T10:30:00Z',
        schedule: { reference: 'Schedule/schedule-1' },
      };

      medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
        if (resourceType === 'Slot') {
          return Promise.resolve([pendingSlot]);
        }
        if (resourceType === 'Appointment') {
          return Promise.resolve([pendingAppointment]);
        }
        return Promise.resolve([]);
      });

      const { result } = renderHook(() => useSchedulingResources(schedules, range), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const bookedAppointment: WithId<Appointment> = { ...pendingAppointment, status: 'booked' };
      const bookedSlot: WithId<Slot> = { ...pendingSlot, status: 'busy-unavailable' };

      medplum.post = vi.fn().mockResolvedValue({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [{ resource: bookedAppointment }, { resource: bookedSlot }],
      });
      medplum.invalidateSearches = vi.fn();

      let confirmResult!: { appointment: WithId<Appointment>; slots: WithId<Slot>[] };
      await act(async () => {
        confirmResult = await result.current.schedulingAPI.confirm(pendingAppointment);
      });

      expect(medplum.post).toHaveBeenCalledWith(
        expect.objectContaining({ href: expect.stringContaining('Appointment/appt-pending/$confirm') })
      );
      expect(confirmResult.appointment).toEqual(bookedAppointment);
      expect(confirmResult.slots).toContainEqual(bookedSlot);
      expect(result.current.appointments).toContainEqual(bookedAppointment);
      expect(result.current.slots).toContainEqual(
        expect.objectContaining({ id: 'slot-pending', status: 'busy-unavailable' })
      );
    });

    test('throws when $confirm returns no Appointment', async () => {
      medplum.searchResources = vi.fn().mockResolvedValue([]);

      const { result } = renderHook(() => useSchedulingResources(schedules, range), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      medplum.post = vi.fn().mockResolvedValue({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [],
      });
      medplum.invalidateSearches = vi.fn();

      await expect(
        act(async () => {
          await result.current.schedulingAPI.confirm({
            resourceType: 'Appointment',
            id: 'appt-1',
            status: 'pending',
            participant: [],
          });
        })
      ).rejects.toThrow('$confirm succeeded without returning updated Appointment');
    });
  });

  describe('updateAppointment()', () => {
    test('calls updateResource and reflects the change in local state', async () => {
      const existing: WithId<Appointment> = {
        resourceType: 'Appointment',
        id: 'appt-update',
        status: 'pending',
        participant: [],
      };

      medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
        if (resourceType === 'Appointment') {
          return Promise.resolve([existing]);
        }
        return Promise.resolve([]);
      });

      const { result } = renderHook(() => useSchedulingResources(schedules, range), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const updated: WithId<Appointment> = { ...existing, status: 'booked' };
      medplum.updateResource = vi.fn().mockResolvedValue(updated);

      await act(async () => {
        await result.current.schedulingAPI.updateAppointment(existing);
      });

      expect(medplum.updateResource).toHaveBeenCalledWith(existing);
      expect(result.current.appointments).toContainEqual(updated);
      expect(result.current.appointments).not.toContainEqual(expect.objectContaining({ status: 'pending' }));
    });
  });

  describe('find()', () => {
    const setupWithEmptyData = async (): Promise<RenderHookResult<UseSchedulingResourcesResult, void>> => {
      medplum.searchResources = vi.fn().mockResolvedValue([]);
      const hookResult = renderHook(() => useSchedulingResources(schedules, range), { wrapper });
      await waitFor(() => expect(hookResult.result.current.loading).toBe(false));
      return hookResult;
    };

    test('builds URL with start, end, service-type-reference, and schedule params', async () => {
      const { result } = await setupWithEmptyData();

      const originalGet = medplum.get.bind(medplum);
      medplum.get = vi.fn().mockImplementation((url: URL, options: unknown) => {
        if (url.toString().includes('$find')) {
          return new ReadablePromise(Promise.resolve({ resourceType: 'Bundle', type: 'searchset', entry: [] }));
        }
        return originalGet(url, options as RequestInit);
      });

      const healthcareService: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'hcs-1' };
      const findRange = { start: new Date('2024-01-16T00:00:00Z'), end: new Date('2024-01-16T23:59:59Z') };

      await act(async () => {
        await result.current.schedulingAPI.find({ healthcareService, range: findRange });
      });

      const callUrl = (medplum.get as ReturnType<typeof vi.fn>).mock.calls
        .map((args: unknown[]) => args[0] as URL)
        .find((url: URL) => url.toString().includes('$find'));

      expect(callUrl).toBeDefined();
      if (!callUrl) {
        return;
      }
      expect(callUrl.href).toContain('start=');
      expect(callUrl.href).toContain('end=');
      expect(callUrl.href).toContain('service-type-reference=');
      expect(callUrl.href).toContain(encodeURIComponent('HealthcareService/hcs-1'));
      expect(callUrl.href).toContain(encodeURIComponent('Schedule/schedule-1'));
    });

    test('passes abort signal to the HTTP call', async () => {
      const { result } = await setupWithEmptyData();

      medplum.get = vi.fn().mockImplementation(() => {
        return new ReadablePromise(Promise.resolve({ resourceType: 'Bundle', type: 'searchset', entry: [] }));
      });

      const controller = new AbortController();

      await act(async () => {
        await result.current.schedulingAPI.find({
          healthcareService: { resourceType: 'HealthcareService', id: 'hcs-1' },
          range: { start: new Date(), end: new Date() },
          abortSignal: controller.signal,
        });
      });

      expect(medplum.get).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ signal: controller.signal })
      );
    });

    test('tags each returned appointment with SchedulingTransientIdentifier', async () => {
      const { result } = await setupWithEmptyData();

      const returnedAppointment: Appointment = { resourceType: 'Appointment', status: 'proposed', participant: [] };
      medplum.get = vi.fn().mockImplementation(() => {
        return new ReadablePromise(
          Promise.resolve({
            resourceType: 'Bundle',
            type: 'searchset',
            entry: [{ resource: returnedAppointment }],
          })
        );
      });

      let appointments!: Appointment[];
      await act(async () => {
        appointments = await result.current.schedulingAPI.find({
          healthcareService: { resourceType: 'HealthcareService', id: 'hcs-1' },
          range: { start: new Date(), end: new Date() },
        });
      });

      expect(appointments).toHaveLength(1);
      expect(SchedulingTransientIdentifier.get(appointments[0])).toBeDefined();
    });
  });
});

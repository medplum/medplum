// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import {
  allOk,
  deepClone,
  EMPTY,
  getReferenceString,
  isDefined,
  isResource,
  normalizeOperationOutcome,
  resolveId,
} from '@medplum/core';
import type {
  Appointment,
  Bundle,
  HealthcareService,
  OperationOutcome,
  Resource,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Range } from '../types/scheduling';
import { assertNever } from '../utils/assert';
import { SchedulingTransientIdentifier } from '../utils/scheduling';

const PAGE_SIZE = 1000;

export interface SchedulingResources {
  schedule: WithId<Schedule>;
  appointments: WithId<Appointment>[];
  slots: WithId<Slot>[];
}

export interface AppointmentFindOptions {
  healthcareService: WithId<HealthcareService>;
  range: Range;
  abortSignal?: AbortSignal;
}

export interface SchedulingAPI {
  book: (appointment: Appointment) => Promise<{
    appointment: WithId<Appointment>;
    slots: WithId<Slot>[];
  }>;
  cancel: (appointment: WithId<Appointment>) => Promise<WithId<Appointment>>;
  confirm: (appointment: WithId<Appointment>) => Promise<{
    appointment: WithId<Appointment>;
    slots: WithId<Slot>[];
  }>;
  find: (options: AppointmentFindOptions) => Promise<Appointment[]>;
  updateAppointment: (appointment: WithId<Appointment>) => Promise<WithId<Appointment>>;
}

export interface UseSchedulingResourcesResult {
  schedulingResources: SchedulingResources[] | undefined;
  slots: Slot[] | undefined;
  appointments: Appointment[] | undefined;
  loading: boolean;
  operationOutcome: OperationOutcome | undefined;
  schedulingAPI: SchedulingAPI;
}

type OptimisticUpdateStore<T extends Resource> = Record<
  string,
  | { resource: T; action: 'created' | 'updated'; timestamp: number }
  | { resource: undefined; action: 'deleted'; timestamp: number }
>;

function getTimestamp(resource: Resource): number | undefined {
  if (resource.meta?.lastUpdated) {
    return new Date(resource.meta.lastUpdated).getTime();
  }
  return undefined;
}

function isStaleOptimisticUpdate(timestamp: number, serverResource: Resource): boolean {
  const lastUpdated = serverResource.meta?.lastUpdated;
  return lastUpdated !== undefined && new Date(lastUpdated).getTime() > timestamp;
}

function isWithinRange(start: string | undefined, range: Range): boolean {
  if (!start) {
    return false;
  }
  const time = new Date(start).getTime();
  return time >= range.start.getTime() && time <= range.end.getTime();
}

async function fetchSchedulingResources(
  medplum: MedplumClient,
  schedule: WithId<Schedule>,
  range: Range
): Promise<SchedulingResources> {
  // To make loading fast, we search for appointments related to the schedule participants
  // because we can run this query in parallel to the Slot fetching query.
  //
  // Hypothetically, a slot could be referenced by an appointment that does not
  // have a participant matching the schedule's actors. If we need to catch
  // that we can emit a secondary query after `slotPromise` has resolved to
  // find Appointments with `Appointment.slot` matching one of our returned
  // slots.
  //
  // This seems to be uncommon in practice, so we do not currently emit the extra query.
  const actors = schedule.actor.map(getReferenceString).filter(isDefined);
  const appointmentPromise =
    actors.length > 0
      ? medplum.searchResources('Appointment', [
          ['_count', PAGE_SIZE.toString()],
          ['actor', actors.join(',')],
          ['date', `ge${range.start.toISOString()}`],
          ['date', `le${range.end.toISOString()}`],
          ['status:not', 'cancelled'],
        ])
      : [];

  const slotPromise = medplum.searchResources('Slot', [
    ['_count', PAGE_SIZE.toString()],
    ['schedule', getReferenceString(schedule)],
    ['start', `ge${range.start.toISOString()}`],
    ['start', `le${range.end.toISOString()}`],
    ['status:not', 'entered-in-error'],
  ]);

  return {
    schedule,
    slots: await slotPromise,
    appointments: await appointmentPromise,
  };
}

function applyOptimisticUpdates<T extends Resource>(
  resources: WithId<T>[],
  optimisticUpdates: OptimisticUpdateStore<WithId<T>>,
  isVisible: (resource: T) => boolean
): WithId<T>[] {
  const seen = new Set<string>();
  const values = resources
    .map((resource) => {
      seen.add(resource.id);
      const update = optimisticUpdates[resource.id];
      if (!update || isStaleOptimisticUpdate(update.timestamp, resource)) {
        return resource;
      }
      if (update.action === 'deleted') {
        return undefined;
      } else if (update.action === 'updated' || update.action === 'created') {
        return update.resource;
      } else {
        return assertNever(update.action);
      }
    })
    .filter(isDefined);

  const created = Object.values(optimisticUpdates)
    .map((update) => {
      if (update.action !== 'created' || seen.has(update.resource.id) || !isVisible(update.resource)) {
        return undefined;
      }
      return update.resource;
    })
    .filter(isDefined);

  return [...values, ...created];
}

export function useSchedulingResources(
  schedules: WithId<Schedule>[],
  range: Range | undefined
): UseSchedulingResourcesResult {
  const medplum = useMedplum();
  const [schedulingResources, setSchedulingResources] = useState<SchedulingResources[] | undefined>();
  const [operationOutcome, setOperationOutcome] = useState<OperationOutcome>();
  const [optimisticUpdates, setOptimisticUpdates] = useState<{
    appointment: OptimisticUpdateStore<WithId<Appointment>>;
    slot: OptimisticUpdateStore<WithId<Slot>>;
  }>({
    appointment: {},
    slot: {},
  });

  useEffect(() => {
    if (!range) {
      return () => {};
    }

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSchedulingResources(undefined);
    setOperationOutcome(undefined);

    Promise.all(schedules.map((schedule) => fetchSchedulingResources(medplum, schedule, range)))
      .then((results) => {
        if (active) {
          setSchedulingResources(results);

          const foundAllResources = results.every(
            (resourceRow) => resourceRow.slots.length < PAGE_SIZE && resourceRow.appointments.length < PAGE_SIZE
          );

          if (foundAllResources) {
            setOperationOutcome(allOk);
          } else {
            setOperationOutcome({
              resourceType: 'OperationOutcome',
              issue: [
                {
                  severity: 'warning',
                  code: 'incomplete',
                  details: {
                    text: 'Too many slots or appointments in range, some results may not be shown.',
                  },
                },
              ],
            });
          }
        }
      })
      .catch((err) => {
        if (active) {
          setOperationOutcome(normalizeOperationOutcome(err));
        }
      });

    return () => {
      active = false;
    };
  }, [medplum, schedules, range]);

  const optimisticAppointmentChange = useCallback((resource: WithId<Appointment>, action: 'created' | 'updated') => {
    const timestamp = getTimestamp(resource) ?? Date.now();
    setOptimisticUpdates((store) => ({
      appointment: {
        ...store.appointment,
        [resource.id]: { resource, action, timestamp },
      },
      slot: store.slot,
    }));
  }, []);

  const optimisticSlotChange = useCallback((resource: WithId<Slot>, action: 'created' | 'updated') => {
    const timestamp = getTimestamp(resource) ?? Date.now();
    setOptimisticUpdates((store) => ({
      appointment: store.appointment,
      slot: {
        ...store.slot,
        [resource.id]: { resource, action, timestamp },
      },
    }));
  }, []);

  const optimisticSlotDelete = useCallback((id: string) => {
    const timestamp = Date.now();
    setOptimisticUpdates((store) => ({
      appointment: store.appointment,
      slot: {
        ...store.slot,
        [id]: { resource: undefined, action: 'deleted', timestamp },
      },
    }));
  }, []);

  const book = useCallback(
    async (
      appointment: Appointment
    ): Promise<{
      appointment: WithId<Appointment>;
      slots: WithId<Slot>[];
    }> => {
      const booking = deepClone(appointment);
      SchedulingTransientIdentifier.remove(booking);

      const created = await medplum.post<Bundle<WithId<Appointment> | WithId<Slot>>>(
        medplum.fhirUrl('Appointment', '$book'),
        {
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'appointment',
              resource: booking,
            },
          ],
        }
      );
      medplum.invalidateSearches('Appointment');
      medplum.invalidateSearches('Slot');
      const createdResources = created.entry?.map((entry) => entry.resource) ?? EMPTY;
      const createdAppointment = createdResources.find((res) => isResource<Appointment>(res, 'Appointment'));
      const createdSlots = createdResources.filter((res) => isResource<Slot>(res, 'Slot'));

      if (!createdAppointment) {
        throw new Error('$book succeeded but did not return an Appointment');
      }

      optimisticAppointmentChange(createdAppointment, 'created');
      createdSlots.forEach((createdSlot) => optimisticSlotChange(createdSlot, 'created'));

      return { appointment: createdAppointment, slots: createdSlots };
    },
    [medplum, optimisticAppointmentChange, optimisticSlotChange]
  );

  const confirm = useCallback(
    async (
      appointment: WithId<Appointment>
    ): Promise<{
      appointment: WithId<Appointment>;
      slots: WithId<Slot>[];
    }> => {
      const updated = await medplum.post<Bundle<WithId<Appointment> | WithId<Slot>>>(
        medplum.fhirUrl('Appointment', appointment.id, '$confirm')
      );
      medplum.invalidateSearches('Appointment');
      medplum.invalidateSearches('Slot');
      const updatedResources = updated.entry?.map((entry) => entry.resource) ?? EMPTY;
      const updatedAppointment = updatedResources.find((res) => isResource<Appointment>(res, 'Appointment'));
      const updatedSlots = updatedResources.filter((res) => isResource<Slot>(res, 'Slot'));
      if (updatedAppointment) {
        optimisticAppointmentChange(updatedAppointment, 'updated');
      } else {
        throw new Error('$confirm succeeded without returning updated Appointment');
      }
      updatedSlots.forEach((updated) => optimisticSlotChange(updated, 'updated'));
      return { appointment: updatedAppointment, slots: updatedSlots };
    },
    [medplum, optimisticAppointmentChange, optimisticSlotChange]
  );

  const cancel = useCallback(
    async (appointment: WithId<Appointment>): Promise<WithId<Appointment>> => {
      const updated = await medplum.post<WithId<Appointment>>(
        medplum.fhirUrl('Appointment', appointment.id, '$cancel')
      );
      medplum.invalidateSearches('Appointment');
      medplum.invalidateSearches('Slot');

      optimisticAppointmentChange(updated, 'updated');
      if (updated.slot) {
        updated.slot.forEach((slot) => {
          const id = resolveId(slot);
          if (id) {
            optimisticSlotDelete(id);
          }
        });
      }

      return updated;
    },
    [medplum, optimisticAppointmentChange, optimisticSlotDelete]
  );

  const find = useCallback(
    async (options: AppointmentFindOptions): Promise<Appointment[]> => {
      const start = options.range.start.toISOString();
      const end = options.range.end.toISOString();
      const url = medplum.fhirUrl('Appointment', '$find');
      url.searchParams.append('start', start);
      url.searchParams.append('end', end);
      url.searchParams.append('service-type-reference', getReferenceString(options.healthcareService));
      schedules.forEach((schedule) => {
        url.searchParams.append('schedule', getReferenceString(schedule));
      });

      return medplum.get<Bundle<Appointment>>(url, { signal: options.abortSignal }).then((bundle) => {
        if (bundle.entry) {
          bundle.entry.forEach((entry) => entry.resource && SchedulingTransientIdentifier.set(entry.resource));
          return bundle.entry.map((entry) => entry.resource).filter(isDefined);
        } else {
          return [];
        }
      });
    },
    [medplum, schedules]
  );

  const updateAppointment = useCallback(
    async (appointment: WithId<Appointment>): Promise<WithId<Appointment>> => {
      const updated = await medplum.updateResource(appointment);
      optimisticAppointmentChange(updated, 'updated');
      return updated;
    },
    [medplum, optimisticAppointmentChange]
  );

  const schedulingAPI = useMemo(
    () => ({
      book,
      cancel,
      confirm,
      find,
      updateAppointment,
    }),
    [book, cancel, confirm, find, updateAppointment]
  );

  const schedulingResourcesWithUpdates = useMemo(() => {
    if (!schedulingResources || !range) {
      return undefined;
    }
    return schedulingResources.map((resourceRow) => {
      const scheduleRef = getReferenceString(resourceRow.schedule);
      const actorRefs = new Set(resourceRow.schedule.actor.map((a) => getReferenceString(a)).filter(isDefined));
      const isSlotVisible = (slot: Slot): boolean =>
        getReferenceString(slot.schedule) === scheduleRef && isWithinRange(slot.start, range);
      const isAppointmentVisible = (appt: Appointment): boolean =>
        appt.participant.some(({ actor }) => {
          const ref = actor && getReferenceString(actor);
          return ref ? actorRefs.has(ref) : false;
        }) && isWithinRange(appt.start, range);
      return {
        ...resourceRow,
        slots: applyOptimisticUpdates(resourceRow.slots, optimisticUpdates.slot, isSlotVisible),
        appointments: applyOptimisticUpdates(
          resourceRow.appointments,
          optimisticUpdates.appointment,
          isAppointmentVisible
        ),
      };
    });
  }, [schedulingResources, optimisticUpdates.slot, optimisticUpdates.appointment, range]);

  const slots = useMemo(
    () => schedulingResourcesWithUpdates?.flatMap((row) => row.slots),
    [schedulingResourcesWithUpdates]
  );

  const appointments = useMemo(
    () => schedulingResourcesWithUpdates?.flatMap((row) => row.appointments),
    [schedulingResourcesWithUpdates]
  );

  return {
    schedulingResources: schedulingResourcesWithUpdates,
    loading: range !== undefined && operationOutcome === undefined,
    operationOutcome,
    schedulingAPI,
    slots,
    appointments,
  };
}

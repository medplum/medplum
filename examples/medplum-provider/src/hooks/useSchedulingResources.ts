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
import type { Appointment, Bundle, HealthcareService, OperationOutcome, Schedule, Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Range } from '../types/scheduling';
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

async function fetchSchedulingResources(
  medplum: MedplumClient,
  schedule: WithId<Schedule>,
  range: Range
): Promise<SchedulingResources> {
  const slotPromise = medplum.searchResources('Slot', [
    ['_count', PAGE_SIZE.toString()],
    ['schedule', getReferenceString(schedule)],
    ['start', `ge${range.start.toISOString()}`],
    ['start', `le${range.end.toISOString()}`],
    ['status:not', 'entered-in-error'],
  ]);

  const actors = schedule.actor.map(getReferenceString).filter(isDefined);

  // To make loading fast, we search for appointments related to the schedule participants
  // because we can run this query in parallel to the Slot fetching query.
  //
  // Hypothetically, a slot could be referenced by an appointment that does not have a participant
  // matching the schedule's actors. If we need to catch that we can emit a secondary query
  // after `slotPromise` has resolved to find `Appointment?slot=Slot/1,Slot/2,...`.
  //
  // This seems to be uncommon in practice so we do not currently emit the extra query.
  const appointmentPromise =
    actors.length > 0
      ? medplum.searchResources('Appointment', [
          ['_count', PAGE_SIZE.toString()],
          ['actor', actors.join(',')],
          ['date', `ge${range.start.toISOString()}`],
          ['date', `le${range.end.toISOString()}`],
        ])
      : [];

  return {
    schedule,
    slots: await slotPromise,
    appointments: await appointmentPromise,
  };
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
  slots: Slot[] | undefined;
  appointments: Appointment[] | undefined;
  schedulingResources: SchedulingResources[] | undefined;
  loading: boolean;
  operationOutcome: OperationOutcome | undefined;
  schedulingAPI: SchedulingAPI;
}

export function useSchedulingResources(
  schedules: WithId<Schedule>[],
  range: Range | undefined
): UseSchedulingResourcesResult {
  const medplum = useMedplum();
  const [schedulingResources, setSchedulingResources] = useState<SchedulingResources[] | undefined>();
  const [operationOutcome, setOperationOutcome] = useState<OperationOutcome>();

  useEffect(() => {
    if (!range) {
      return () => {};
    }

    let active = true;
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

  const handleAppointmentUpdated = useCallback((updated: WithId<Appointment>) => {
    setSchedulingResources((resources) => {
      if (!resources) {
        return undefined;
      }
      return resources.map((resourceRow) => {
        return {
          ...resourceRow,
          appointments: resourceRow.appointments.map((a) => (a.id === updated.id ? updated : a)),
        };
      });
    });
  }, []);

  const updateSlot = useCallback((updated: WithId<Slot>) => {
    setSchedulingResources((resources) => {
      if (!resources) {
        return undefined;
      }
      return resources.map((resourceRow) => {
        return {
          ...resourceRow,
          slots: resourceRow.slots.map((s) => (s.id === updated.id ? updated : s)),
        };
      });
    });
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

      const scheduleMap = new Map(createdSlots.map((slot) => [resolveId(slot.schedule), slot]));

      setSchedulingResources((resources) => {
        if (!resources) {
          return undefined;
        }
        return resources.map((resourceRow) => {
          const createdSlot = scheduleMap.get(resourceRow.schedule.id);
          if (!createdSlot) {
            return resourceRow;
          }
          return {
            ...resourceRow,
            appointments: [...resourceRow.appointments, createdAppointment],
            slots: [...resourceRow.slots, createdSlot],
          };
        });
      });

      return { appointment: createdAppointment, slots: createdSlots };
    },
    [medplum]
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
        handleAppointmentUpdated(updatedAppointment);
      } else {
        throw new Error('$confirm succeeded without returning updated Appointment');
      }
      updatedSlots.map((updated) => updateSlot(updated));
      return { appointment: updatedAppointment, slots: updatedSlots };
    },
    [medplum, handleAppointmentUpdated, updateSlot]
  );

  const cancel = useCallback(
    async (appointment: WithId<Appointment>): Promise<WithId<Appointment>> => {
      const updated = await medplum.post<WithId<Appointment>>(
        medplum.fhirUrl('Appointment', appointment.id, '$cancel')
      );
      medplum.invalidateSearches('Appointment');
      medplum.invalidateSearches('Slot');
      handleAppointmentUpdated(updated);
      // $cancel soft-deletes referenced slots; remove them from our local state
      if (updated.slot) {
        const ids = new Set(updated.slot.map((ref) => resolveId(ref)).filter(isDefined));
        setSchedulingResources((resources) => {
          if (!resources) {
            return undefined;
          }
          return resources.map((resourceRow) => {
            return {
              ...resourceRow,
              slots: resourceRow.slots.filter((s) => !ids.has(s.id)),
            };
          });
        });
      }
      return updated;
    },
    [medplum, handleAppointmentUpdated]
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
      handleAppointmentUpdated(updated);
      return updated;
    },
    [medplum, handleAppointmentUpdated]
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

  const slots = useMemo(() => {
    if (!schedulingResources) {
      return undefined;
    }
    return schedulingResources.map((resourceRow) => resourceRow.slots).flat();
  }, [schedulingResources]);

  const appointments = useMemo(() => {
    if (!schedulingResources) {
      return undefined;
    }
    return schedulingResources.map((resourceRow) => resourceRow.appointments).flat();
  }, [schedulingResources]);

  return {
    schedulingResources,
    loading: operationOutcome === undefined,
    operationOutcome,
    schedulingAPI,
    slots,
    appointments,
  };
}

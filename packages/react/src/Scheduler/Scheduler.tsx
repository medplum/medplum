// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Stack, Text } from '@mantine/core';
import { getReferenceString, isReference, resolveId, WithId } from '@medplum/core';
import {
  Period,
  Practitioner,
  Questionnaire,
  QuestionnaireResponse,
  Reference,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { JSX, useEffect, useMemo, useState } from 'react';
import { CalendarInput } from '../CalendarInput/CalendarInput';
import { getStartMonth } from '../CalendarInput/CalendarInput.utils';
import { QuestionnaireForm } from '../QuestionnaireForm/QuestionnaireForm';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { ResourceName } from '../ResourceName/ResourceName';
import classes from './Scheduler.module.css';

/**
 * Custom function to search for available slots within a given time period
 * @param period - The time period to search within
 * @returns Promise resolving to an array of available slots
 */
export type SlotSearchFunction = (period: Period) => Promise<Slot[]>;
export interface SchedulerProps {
  readonly schedule: Schedule | Reference<Schedule> | Schedule[] | Reference<Schedule>[] | SlotSearchFunction;
  readonly questionnaire: Questionnaire | Reference<Questionnaire>;
}

export function Scheduler(props: SchedulerProps): JSX.Element | null {
  const medplum = useMedplum();
  const questionnaire = useResource(props.questionnaire);

  const [month, setMonth] = useState<Date>(getStartMonth());
  const [date, setDate] = useState<Date>();
  const [response, setResponse] = useState<QuestionnaireResponse>();
  const [scheduleToActorMap, setScheduleToActorMap] = useState<
    Map<string, Reference<Practitioner> & { reference: string }>
  >(new Map());
  const [slots, setSlots] = useState<Slot[]>();
  const [selectedSlot, setSelectedSlot] = useState<Slot>();

  useEffect(() => {
    if (!props.schedule) {
      setSlots([]);
      return;
    }

    // Helper to resolve Schedule or Reference to full Schedule resource
    const resolveSchedule = (schedule: Schedule | Reference<Schedule>): Promise<Schedule> => {
      return isReference(schedule)
        ? medplum.readReference<Schedule>(schedule as Reference<Schedule>)
        : Promise.resolve(schedule as Schedule);
    };

    // Function to fetch slots
    let fetchSlots: SlotSearchFunction;

    // If the user provides a function to fetch slots, use it
    if (typeof props.schedule === 'function') {
      fetchSlots = async (period: Period): Promise<Slot[]> => {
        return (props.schedule as SlotSearchFunction)(period).then(async (slots: Slot[]): Promise<Slot[]> => {
          // Extract unique schedule references from slots
          const scheduleRefs = Array.from(
            new Set(slots.map((slot) => slot.schedule).filter((r) => isReference<Schedule>(r, 'Schedule')))
          );

          // Resolve all referenced schedules
          const resolvedSchedules = await Promise.all(scheduleRefs.map((ref) => medplum.readReference(ref)));

          // Build the schedule to actor map
          const map = new Map<string, Reference<Practitioner> & { reference: string }>();
          resolvedSchedules.forEach((schedule) => {
            const actorRef = schedule.actor?.[0];
            if (isReference<Practitioner>(actorRef, 'Practitioner') && schedule.id) {
              map.set(schedule.id, actorRef);
            }
          });
          setScheduleToActorMap(map);

          return slots;
        });
      };
    } else {
      // Normalize to array for consistent handling
      const scheduleArray = Array.isArray(props.schedule) ? props.schedule : [props.schedule];

      // Helper to convert Schedule or Reference to reference string
      const getScheduleReferenceString = (schedule: Schedule | Reference<Schedule>): string => {
        return isReference<Schedule>(schedule, 'Schedule')
          ? schedule.reference
          : getReferenceString(schedule as WithId<Schedule>);
      };

      // Otherwise, search based on the schedule(s) provided
      fetchSlots = async (period: Period): Promise<Slot[]> => {
        const scheduleRefs = scheduleArray.map(getScheduleReferenceString);
        const slotSearchParams = new URLSearchParams([
          ['_count', (30 * 24).toString()],
          ['schedule', scheduleRefs.join(',')],
          ['start', 'gt' + period.start],
          ['start', 'lt' + period.end],
        ]);
        return medplum.searchResources('Slot', slotSearchParams);
      };

      // Build the schedule to actor map
      Promise.all(scheduleArray.map(resolveSchedule))
        .then((schedules) => {
          const map = new Map<string, Reference<Practitioner> & { reference: string }>();
          schedules.forEach((schedule) => {
            const actorRef = schedule.actor?.[0];
            if (isReference<Practitioner>(actorRef, 'Practitioner') && schedule.id) {
              map.set(schedule.id, actorRef);
            }
          });
          setScheduleToActorMap(map);
        })
        .catch(console.error);
    }

    fetchSlots({ start: getStart(month), end: getEnd(month) })
      .then(setSlots)
      .catch(console.error);
  }, [medplum, props.schedule, month]);

  // Determine if we have multiple actors
  const actors = useMemo(() => {
    return Array.from(scheduleToActorMap.values());
  }, [scheduleToActorMap]);

  const isSingleActor = actors.length === 1;

  // Group slots by actor for multi-actor view
  const slotsByActor = useMemo(() => {
    if (!date || !slots) {
      return null;
    }

    // Filter and sort slots for the selected date
    const filteredSlots = slots.filter((slot) => {
      return (
        new Date(slot.start as string).getTime() > date.getTime() &&
        new Date(slot.start as string).getTime() < date.getTime() + 24 * 3600 * 1000
      );
    });

    // Group slots by actor
    const actorToSlots = new Map<string, Slot[]>();
    filteredSlots.forEach((slot) => {
      const scheduleId = resolveId(slot.schedule);
      if (scheduleId) {
        const actor = scheduleToActorMap.get(scheduleId);
        if (actor) {
          const actorKey = actor.reference;
          if (!actorToSlots.has(actorKey)) {
            actorToSlots.set(actorKey, []);
          }
          actorToSlots.get(actorKey)?.push(slot);
        }
      }
    });

    // Sort slots within each actor group
    actorToSlots.forEach((slots) => {
      slots.sort((a, b) => new Date(a.start as string).getTime() - new Date(b.start as string).getTime());
    });

    return actorToSlots;
  }, [slots, date, scheduleToActorMap]);

  if (!slots || !questionnaire) {
    return null;
  }

  return (
    <div className={classes.container} data-testid="scheduler">
      {isSingleActor && (
        <div className={classes.info}>
          {actors[0] && <ResourceAvatar value={actors[0]} size="xl" />}
          {actors[0] && (
            <Text size="xl" fw={500}>
              <ResourceName value={actors[0]} />
            </Text>
          )}
          <p>1 hour</p>
          {date && <p>{date.toLocaleDateString()}</p>}
          {selectedSlot && <p>{formatTime(new Date(selectedSlot.start as string))}</p>}
        </div>
      )}
      <div className={classes.selection}>
        {!date && (
          <div>
            <h3>Select date</h3>
            <CalendarInput slots={slots} onChangeMonth={setMonth} onClick={setDate} />
          </div>
        )}
        {date && !selectedSlot && (
          <div>
            <h3>Select time</h3>
            {isSingleActor ? (
              <Stack>
                {Array.from(slotsByActor?.values() ?? [])[0]?.map((slot) => {
                  return (
                    <div key={slot.id}>
                      <Button variant="outline" style={{ width: 150 }} onClick={() => setSelectedSlot(slot)}>
                        {formatTime(new Date(slot.start as string))}
                      </Button>
                    </div>
                  );
                })}
              </Stack>
            ) : (
              slotsByActor && (
                <div style={{ display: 'flex', gap: '2rem', overflowX: 'auto' }}>
                  {Array.from(slotsByActor.entries()).map(([actorRef, actorSlots]) => {
                    const actor = actors.find((a) => a.reference === actorRef);
                    return (
                      <div key={actorRef} style={{ minWidth: '200px' }}>
                        <div
                          style={{
                            textAlign: 'center',
                            marginBottom: '1rem',
                            position: 'sticky',
                            top: 0,
                            background: 'white',
                            paddingBottom: '0.5rem',
                          }}
                        >
                          {actor && <ResourceAvatar value={actor} size="lg" />}
                          {actor && (
                            <Text size="md" fw={500}>
                              <ResourceName value={actor} />
                            </Text>
                          )}
                        </div>
                        <Stack>
                          {actorSlots.map((slot) => {
                            return (
                              <div key={slot.id}>
                                <Button
                                  variant="outline"
                                  style={{ width: '100%' }}
                                  onClick={() => setSelectedSlot(slot)}
                                >
                                  {formatTime(new Date(slot.start as string))}
                                </Button>
                              </div>
                            );
                          })}
                        </Stack>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        )}
        {date && selectedSlot && !response && (
          <QuestionnaireForm questionnaire={questionnaire} submitButtonText="Next" onSubmit={setResponse} />
        )}
        {date && selectedSlot && response && (
          <div>
            <h3>You're all set!</h3>
            <p>Check your email for a calendar invite.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function getStart(month: Date): string {
  return formatSlotInstant(month.getTime());
}

function getEnd(month: Date): string {
  return formatSlotInstant(month.getTime() + 31 * 24 * 60 * 60 * 1000);
}

function formatSlotInstant(time: number): string {
  const date = new Date(Math.max(Date.now(), time));
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

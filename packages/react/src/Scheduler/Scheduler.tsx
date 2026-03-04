// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getReferenceString, isReference, isResource } from '@medplum/core';
import type {
  Period,
  Practitioner,
  Questionnaire,
  QuestionnaireResponse,
  Reference,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
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
  readonly schedule?: Schedule | Reference<Schedule> | Schedule[] | Reference<Schedule>[];
  readonly questionnaire?: Questionnaire | Reference<Questionnaire>;
  fetchSlots?: SlotSearchFunction;
}

// Finds the first entry in Schedule.actor of type Reference<Practitioner>
function onlyPractitioner(schedule: Schedule): Reference<Practitioner> | undefined {
  const refs = schedule.actor.filter((ref) => isReference<Practitioner>(ref, 'Practitioner'));
  if (refs.length === 1) {
    return refs[0];
  }
  return undefined;
}

export function Scheduler(props: SchedulerProps): JSX.Element | null {
  const medplum = useMedplum();
  const questionnaire = useResource(props.questionnaire);

  const [month, setMonth] = useState<Date>(getStartMonth());
  const [date, setDate] = useState<Date>();
  const [response, setResponse] = useState<QuestionnaireResponse>();
  const [actor, setActor] = useState<Reference<Practitioner> | undefined>();
  const [slots, setSlots] = useState<Slot[]>();
  const [selectedSlot, setSelectedSlot] = useState<Slot>();

  useEffect(() => {
    if (!props.schedule) {
      setSlots([]);
    }

    // Function to fetch slots
    const fetchSlots: SlotSearchFunction =
      props.fetchSlots ??
      (async (period) => {
        const scheduleArray: string[] = [];
        if (!Array.isArray(props.schedule)) {
          scheduleArray.push(
            isReference<Schedule>(props.schedule, 'Schedule')
              ? props.schedule.reference
              : getReferenceString(props.schedule as WithId<Schedule>)
          );
        } else {
          for (const schedule of props.schedule) {
            if (isReference(schedule)) {
              scheduleArray.push(schedule.reference);
            } else {
              const scheduleRef = getReferenceString(schedule as WithId<Schedule>);
              scheduleArray.push(scheduleRef);
            }
          }
        }
        const slotSearchParams = new URLSearchParams([
          ['_count', (30 * 24).toString()],
          ['schedule', scheduleArray.join(',')],
          ['start', 'gt' + period.start],
          ['start', 'lt' + period.end],
        ]);
        return medplum.searchResources('Slot', slotSearchParams);
      });

    fetchSlots({ start: getStart(month), end: getEnd(month) })
      .then(setSlots)
      .catch(console.error);
  }, [medplum, props.schedule, props.fetchSlots, month]);

  // If a single Schedule or Reference<Schedule> is provided, set the actor from it
  useEffect(() => {
    if (props.schedule && !Array.isArray(props.schedule)) {
      if (isResource(props.schedule)) {
        setActor(onlyPractitioner(props.schedule));
      } else {
        medplum
          .readReference<Schedule>(props.schedule)
          .then((schedule) => setActor(onlyPractitioner(schedule)))
          .catch(console.error);
      }
    }
  }, [medplum, props.schedule]);

  // Create a map of start times to slots to handle duplicate start times
  const startTimeToSlotMap = useMemo(() => {
    if (!date) {
      return null;
    }
    const sortedSlots = (slots || [])
      // Filter slots to only include those that are within the date range
      .filter((slot) => {
        return (
          new Date(slot.start).getTime() > date.getTime() &&
          new Date(slot.start).getTime() < date.getTime() + 24 * 3600 * 1000
        );
      })
      // Sort slots by start time
      .sort((a, b) => {
        return new Date(a.start).getTime() - new Date(b.start).getTime();
      });
    const startTimeToSlotMap = new Map<string, Slot>();
    for (const slot of sortedSlots) {
      startTimeToSlotMap.set(formatTime(new Date(slot.start)), slot);
    }
    return startTimeToSlotMap;
  }, [slots, date]);

  if (!slots || !questionnaire) {
    return null;
  }

  return (
    <div className={classes.container} data-testid="scheduler">
      <div className={classes.info}>
        {actor && <ResourceAvatar value={actor} size="xl" />}
        {actor && (
          <Text size="xl" fw={500}>
            <ResourceName value={actor} />
          </Text>
        )}
        <p>1 hour</p>
        {date && <p>{date.toLocaleDateString()}</p>}
        {selectedSlot && <p>{formatTime(new Date(selectedSlot.start))}</p>}
      </div>
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
            <Stack>
              {Array.from(startTimeToSlotMap?.entries() ?? []).map(([startTime, slot]) => {
                return (
                  <div key={slot.id}>
                    <Button variant="outline" style={{ width: 150 }} onClick={() => setSelectedSlot(slot)}>
                      {startTime}
                    </Button>
                  </div>
                );
              })}
            </Stack>
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

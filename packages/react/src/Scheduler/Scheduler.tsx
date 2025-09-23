// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Stack, Text } from '@mantine/core';
import { getReferenceString, isReference, WithId } from '@medplum/core';
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
  const [actor, setActor] = useState<Reference<Practitioner> | undefined>();
  const [slots, setSlots] = useState<Slot[]>();
  const [selectedSlot, setSelectedSlot] = useState<Slot>();

  useEffect(() => {
    if (!props.schedule) {
      setSlots([]);
    }

    // Function to fetch slots
    let fetchSlots: SlotSearchFunction;

    // If the user provides a function to fetch slots, use it
    if (typeof props.schedule === 'function') {
      fetchSlots = props.schedule;
    } else {
      // Otherwise, search based on the schedule(s) provided
      fetchSlots = async (period: Period): Promise<Slot[]> => {
        let scheduleArray: string[] = [];
        if (!Array.isArray(props.schedule)) {
          scheduleArray.push(
            isReference(props.schedule)
              ? (props.schedule.reference as string)
              : getReferenceString(props.schedule as WithId<Schedule>)
          );
        } else {
          for (const schedule of props.schedule) {
            if (isReference(schedule)) {
              scheduleArray.push(schedule.reference as string);
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
      };

      // If a single schedule is provided, set the actor
      if (props.schedule && !Array.isArray(props.schedule)) {
        if (isReference(props.schedule)) {
          medplum.readReference<Schedule>(props.schedule as Reference<Schedule>).then((schedule) => {
            const actorRef = schedule.actor?.[0] as Reference<Practitioner>;
            setActor(actorRef);
          });
        } else {
          setActor((props.schedule as Schedule).actor?.[0] as Reference<Practitioner>);
        }
      }
    }

    fetchSlots({ start: getStart(month), end: getEnd(month) }).then(setSlots);
  }, [medplum, props.schedule, month]);

  // Create a map of start times to slots to handle duplicate start times
  const startTimeToSlotMap = useMemo(() => {
    if (!date) {
      return null;
    }
    const sortedSlots = (slots || [])
      // Filter slots to only include those that are within the date range
      .filter((slot) => {
        return (
          new Date(slot.start as string).getTime() > date.getTime() &&
          new Date(slot.start as string).getTime() < date.getTime() + 24 * 3600 * 1000
        );
      })
      // Sort slots by start time
      .sort((a, b) => {
        return new Date(a.start as string).getTime() - new Date(b.start as string).getTime();
      });
    const startTimeToSlotMap = new Map<string, Slot>();
    for (const slot of sortedSlots) {
      startTimeToSlotMap.set(formatTime(new Date(slot.start as string)), slot);
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
        {selectedSlot && <p>{formatTime(new Date(selectedSlot.start as string))}</p>}
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

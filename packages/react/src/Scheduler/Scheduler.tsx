import { Button, createStyles, Stack, Text } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse, Reference, Schedule, Slot } from '@medplum/fhirtypes';
import React, { useEffect, useRef, useState } from 'react';
import { CalendarInput, getStartMonth } from '../CalendarInput/CalendarInput';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { QuestionnaireForm } from '../QuestionnaireForm/QuestionnaireForm';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { ResourceName } from '../ResourceName/ResourceName';
import { useResource } from '../useResource/useResource';

const useStyles = createStyles((theme) => ({
  container: {
    display: 'flex',
    minHeight: 400,
  },

  info: {
    minWidth: 300,
    padding: 20,
    borderRight: `1px solid ${theme.colors.gray[3]}`,
  },

  selection: {
    minWidth: 300,
    padding: 20,
  },
}));

export interface SchedulerProps {
  schedule: Schedule | Reference<Schedule>;
  questionnaire: Questionnaire | Reference<Questionnaire>;
}

export function Scheduler(props: SchedulerProps): JSX.Element | null {
  const { classes } = useStyles();
  const medplum = useMedplum();
  const schedule = useResource(props.schedule);
  const questionnaire = useResource(props.questionnaire);

  const [slots, setSlots] = useState<Slot[]>();
  const slotsRef = useRef<Slot[]>();
  slotsRef.current = slots;

  const [month, setMonth] = useState<Date>(getStartMonth());
  const [date, setDate] = useState<Date>();
  const [slot, setSlot] = useState<Slot>();
  const [response, setResponse] = useState<QuestionnaireResponse>();

  useEffect(() => {
    if (schedule) {
      setSlots([]);
      medplum
        .searchResources(
          'Slot',
          new URLSearchParams([
            ['_count', (30 * 24).toString()],
            ['schedule', getReferenceString(schedule)],
            ['start', 'gt' + getStart(month)],
            ['start', 'lt' + getEnd(month)],
          ])
        )
        .then(setSlots)
        .catch(console.log);
    } else {
      setSlots(undefined);
    }
  }, [medplum, schedule, month]);

  if (!schedule || !slots || !questionnaire) {
    return null;
  }

  const actor = schedule.actor?.[0];

  return (
    <div className={classes.container} data-testid="scheduler">
      <div className={classes.info}>
        {actor && <ResourceAvatar value={actor} size="xl" />}
        {actor && (
          <Text size="xl" weight={500}>
            <ResourceName value={actor} />
          </Text>
        )}
        <p>1 hour</p>
        {date && <p>{date.toLocaleDateString()}</p>}
        {slot && <p>{formatTime(new Date(slot.start as string))}</p>}
      </div>
      <div className={classes.selection}>
        {!date && (
          <div>
            <h3>Select date</h3>
            <CalendarInput slots={slots} onChangeMonth={setMonth} onClick={setDate} />
          </div>
        )}
        {date && !slot && (
          <div>
            <h3>Select time</h3>
            <Stack>
              {slots.map((s) => {
                const slotStart = new Date(s.start as string);
                return (
                  slotStart.getTime() > date.getTime() &&
                  slotStart.getTime() < date.getTime() + 24 * 3600 * 1000 && (
                    <div key={s.id}>
                      <Button variant="outline" style={{ width: 150 }} onClick={() => setSlot(s)}>
                        {formatTime(slotStart)}
                      </Button>
                    </div>
                  )
                );
              })}
            </Stack>
          </div>
        )}
        {date && slot && !response && (
          <QuestionnaireForm questionnaire={questionnaire} submitButtonText={'Next'} onSubmit={setResponse} />
        )}
        {date && slot && response && (
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
  return new Date(Math.max(Date.now(), time)).toISOString();
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

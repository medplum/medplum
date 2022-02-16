import { Reference, Schedule } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { CalendarInput } from './CalendarInput';
import { FormSection } from './FormSection';
import { Input } from './Input';
import { ResourceName } from './ResourceName';
import { useResource } from './useResource';
import './Scheduler.css';

export interface SchedulerProps {
  schedule: Schedule | Reference<Schedule>;
}

export function Scheduler(props: SchedulerProps): JSX.Element | null {
  const schedule = useResource(props.schedule);
  const [month, setMonth] = useState<Date>(new Date());
  const [date, setDate] = useState<string>();
  const [time, setTime] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [form, setForm] = useState<string>();

  function moveMonth(delta: number): void {
    setMonth((currMonth) => {
      const prevMonth = new Date(currMonth.getTime());
      prevMonth.setMonth(currMonth.getMonth() + delta);
      return prevMonth;
    });
  }

  if (!schedule) {
    return null;
  }

  const actor = schedule.actor?.[0];

  return (
    <div className="medplum-calendar-container" data-testid="scheduler">
      <div className="medplum-calendar-info-pane">
        {actor && <Avatar value={actor} size="large" />}
        {actor && (
          <h1>
            <ResourceName value={actor} />
          </h1>
        )}
        <h3>1 hour</h3>
        {date && <p>{date}</p>}
        {time && <p>{time}</p>}
      </div>
      <div className="medplum-calendar-selection-pane">
        {!date && (
          <div>
            <h3>Select date</h3>
            <p>
              {month.toLocaleString('default', { month: 'long' })}&nbsp;{month.getFullYear()}
              &nbsp;
              <button onClick={() => moveMonth(-1)}>&lt;</button>
              <button onClick={() => moveMonth(1)}>&gt;</button>
            </p>
            <CalendarInput year={month.getFullYear()} month={month.getMonth()} onClick={setDate} />
          </div>
        )}
        {date && !time && (
          <div>
            <h1>Select time</h1>
            <Button onClick={() => setTime('12:00:00')}>Time</Button>
          </div>
        )}
        {date && time && !info && (
          <div>
            <h3>Enter your info</h3>
            <FormSection title="Name" htmlFor="name">
              <Input name="name" />
            </FormSection>
            <FormSection title="Email" htmlFor="email">
              <Input name="email" />
            </FormSection>
            <Button primary={true} onClick={() => setInfo('info')}>
              Next
            </Button>
          </div>
        )}
        {date && time && info && !form && (
          <div>
            <h3>Custom questions</h3>
            <FormSection title="Question 1" htmlFor="q1">
              <Input name="q1" />
            </FormSection>
            <FormSection title="Question 2" htmlFor="q2">
              <Input name="email" />
            </FormSection>
            <FormSection title="Question 3" htmlFor="q3">
              <Input name="email" />
            </FormSection>
            <Button primary={true} onClick={() => setForm('form')}>
              Next
            </Button>
          </div>
        )}
        {date && time && info && form && (
          <div>
            <h3>You're all set!</h3>
            <p>Check your email for a calendar invite.</p>
          </div>
        )}
      </div>
    </div>
  );
}

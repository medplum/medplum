// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import { formatDateTime, getReferenceString, parseReference } from '@medplum/core';
import type { Appointment, Reference, ResourceType } from '@medplum/fhirtypes';
import { useSearchResources } from '@medplum/react-hooks';
import type { JSX } from 'react';
import classes from './ComboDayView.module.css';

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 19;
const DAY_WINDOW_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;
const HOUR_MARKS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i);
const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

function formatTime(iso: string | undefined): string {
  return formatDateTime(iso, undefined, TIME_FORMAT);
}

const FIELD_LABEL: Partial<Record<ResourceType, string>> = {
  Practitioner: 'Provider',
  Location: 'Room',
  Device: 'Device',
};

type ComboDayViewProps = {
  actors: { ref: Reference; label: string }[];
  candidateStart: string;
  candidateEnd: string;
};

function minutesFromDayStart(iso: string): number {
  const d = new Date(iso);
  return (d.getHours() - DAY_START_HOUR) * 60 + d.getMinutes();
}

function pct(minutes: number): number {
  return Math.min(100, Math.max(0, (minutes / DAY_WINDOW_MINUTES) * 100));
}

function formatHour(hour: number): string {
  const period = hour < 12 || hour === 24 ? 'AM' : 'PM';
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}${period}`;
}

function HourAxis(): JSX.Element {
  return (
    <div className={classes.hourAxis}>
      {HOUR_MARKS.map((hour) => (
        <Text key={hour} size="xs" c="dimmed" className={classes.hourLabel} style={{ left: `${pct((hour - DAY_START_HOUR) * 60)}%` }}>
          {formatHour(hour)}
        </Text>
      ))}
    </div>
  );
}

function Lane(props: {
  label: string;
  name: string;
  appointments: Appointment[];
  candidateStart: string;
  candidateEnd: string;
}): JSX.Element {
  const { label, name, appointments, candidateStart, candidateEnd } = props;
  const candidateLeft = pct(minutesFromDayStart(candidateStart));
  const candidateWidth = pct(minutesFromDayStart(candidateEnd)) - candidateLeft;

  return (
    <Group gap="sm" wrap="nowrap" align="center" className={classes.laneRow}>
      <Stack gap={0} className={classes.laneLabel}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {label}
        </Text>
        <Text size="sm" fw={500} truncate>
          {name}
        </Text>
      </Stack>
      <div className={classes.track}>
        {HOUR_MARKS.map((hour) => (
          <div key={hour} className={classes.gridline} style={{ left: `${pct((hour - DAY_START_HOUR) * 60)}%` }} />
        ))}
        {appointments.map((apt) => {
          const left = pct(minutesFromDayStart(apt.start as string));
          const width = pct(minutesFromDayStart(apt.end as string)) - left;
          return (
            <div
              key={apt.id}
              className={classes.busyBlock}
              style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
              title={`Booked ${formatTime(apt.start)}–${formatTime(apt.end)}`}
            />
          );
        })}
        <div
          className={classes.candidateBlock}
          style={{ left: `${candidateLeft}%`, width: `${Math.max(candidateWidth, 1)}%` }}
          title={`This appointment ${formatTime(candidateStart)}–${formatTime(candidateEnd)}`}
        />
      </div>
    </Group>
  );
}

/**
 * Compact 3-lane day-view (spec §4.3), scoped to exactly the selected
 * combo's actors — Provider, Room, and (when the visit type requires one)
 * Device — shown in the booking confirmation drawer, never during
 * search/browsing. Each lane shows that actor's existing booked
 * appointments for the day plus the highlighted candidate window.
 * Deliberately always exactly as many lanes as the combo has actors (2 or
 * 3), which is what keeps this cheap and avoids the full-pool-overlay
 * clutter problem the PRD's literal framing would have reintroduced.
 * @param props - Combo day-view props.
 * @returns A React element rendering the day view.
 */
export function ComboDayView(props: ComboDayViewProps): JSX.Element {
  const { actors, candidateStart, candidateEnd } = props;
  const day = new Date(candidateStart);
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);

  return (
    <Stack gap={6} className={classes.container}>
      <HourAxis />
      {actors.map(({ ref, label }) => (
        <ActorLane
          key={getReferenceString(ref)}
          actorRef={ref}
          label={label}
          dayStart={dayStart}
          dayEnd={dayEnd}
          candidateStart={candidateStart}
          candidateEnd={candidateEnd}
        />
      ))}
      <Group gap="lg" mt={4}>
        <Group gap={6}>
          <div className={classes.legendSwatchBusy} />
          <Text size="xs" c="dimmed">
            Booked
          </Text>
        </Group>
        <Group gap={6}>
          <div className={classes.legendSwatchCandidate} />
          <Text size="xs" c="dimmed">
            This appointment
          </Text>
        </Group>
      </Group>
    </Stack>
  );
}

function ActorLane(props: {
  actorRef: Reference;
  label: string;
  dayStart: Date;
  dayEnd: Date;
  candidateStart: string;
  candidateEnd: string;
}): JSX.Element {
  const { actorRef, label, dayStart, dayEnd, candidateStart, candidateEnd } = props;
  const resourceType = parseReference(actorRef)[0];
  const [appointments] = useSearchResources('Appointment', [
    ['actor', getReferenceString(actorRef) ?? ''],
    ['date', `ge${dayStart.toISOString()}`],
    ['date', `le${dayEnd.toISOString()}`],
    ['status:not', 'cancelled'],
  ]);

  return (
    <Lane
      label={FIELD_LABEL[resourceType] ?? resourceType}
      name={label}
      appointments={appointments ?? []}
      candidateStart={candidateStart}
      candidateEnd={candidateEnd}
    />
  );
}

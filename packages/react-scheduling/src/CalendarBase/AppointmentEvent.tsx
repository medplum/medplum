// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { EventDisplayInfo } from '@fullcalendar/react';
import { Badge, Divider, Group, Popover, Stack, Text } from '@mantine/core';
import { getPrimaryProvider } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { ResourceName } from '@medplum/react';
import cx from 'clsx';
import type { JSX } from 'react';
import { useState } from 'react';
import { getNonPatientActors } from '../actors';
import { formatZonedTime } from '../AppointmentFinder/AppointmentFinder.times';
import { AppointmentStatusBadge } from '../AppointmentStatusBadge';
import { ServiceTypeDisplay } from '../ServiceTypeDisplay';
import { partitionServiceTypes } from '../serviceTypes';
// Its own sheet: importing CalendarBase's here would load it ahead of FullCalendar's theme,
// which its rules are written to override.
import classes from './AppointmentEvent.module.css';
import { AppointmentPatientName } from './AppointmentPatientName';

export interface AppointmentEventProps {
  readonly appointment: Appointment;
  /** What FullCalendar hands its event content, to draw the event as it would. */
  readonly info: EventDisplayInfo;
}

/**
 * An appointment event, titled by its service type over its patient, with a card naming
 * everyone it is held on while it is hovered.
 *
 * The event is drawn on one calendar only, so the card is where the rest of them are named.
 *
 * @param props - The React props.
 * @returns The event's content.
 */
export function AppointmentEvent(props: AppointmentEventProps): JSX.Element {
  const { appointment, info } = props;
  const hasServiceType = !!partitionServiceTypes(appointment).visitType;
  // A time grid says when the visit is by where it is drawn, so there the line under the service
  // type names the patient; a month's row has room for the service type and its time alone.
  const inTimeGrid = info.view.type.startsWith('timeGrid');
  // Each card is mounted only while its event is hovered: a card per event costs about twice
  // what drawing the event does, on every render, and most events are never hovered.
  const [opened, setOpened] = useState(false);

  return (
    <div
      className={classes.eventContent}
      data-time-grid={inTimeGrid || undefined}
      onMouseEnter={() => setOpened(true)}
      onMouseLeave={() => setOpened(false)}
    >
      {inTimeGrid ? (
        <div className={info.timeClass}>
          <AppointmentPatientName appointment={appointment} />
        </div>
      ) : (
        info.timeText && <div className={cx(info.timeClass, classes.time)}>{info.timeText}</div>
      )}
      <div className={cx(info.titleClass, classes.title)}>
        {/* With no service type, a placeholder holds the title's place, so the patient stays under it. */}
        {hasServiceType ? (
          <ServiceTypeDisplay appointment={appointment} inherit />
        ) : (
          <span className={classes.untyped}>Appointment (no service type)</span>
        )}
      </div>
      {opened && (
        <Popover opened shadow="md" position="right-start">
          <Popover.Target>
            {/* Spans the event, so the card is placed beside it. */}
            <span className={classes.anchor} />
          </Popover.Target>
          {/* A floor on the width so most cards come out the same size. */}
          <Popover.Dropdown miw={260}>
            <AppointmentCard appointment={appointment} info={info} />
          </Popover.Dropdown>
        </Popover>
      )}
    </div>
  );
}

/**
 * The card an appointment event opens: its patient and status, what it is for and when, and
 * everyone it is held on, marking the primary provider when the appointment marks one.
 * @param props - The React props.
 * @returns The card's content.
 */
function AppointmentCard(props: AppointmentEventProps): JSX.Element {
  const { appointment, info } = props;
  const primary = getPrimaryProvider(appointment);
  const { start, end } = info.event;
  const hasServiceType = !!partitionServiceTypes(appointment).visitType;
  const times = start && end && `${formatZonedTime(start)} – ${formatZonedTime(end)}`;

  return (
    <Stack gap={4}>
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Text fw={500}>
          <AppointmentPatientName appointment={appointment} />
        </Text>
        <AppointmentStatusBadge status={appointment.status} size="sm" />
      </Group>
      <Divider />
      {(hasServiceType || times) && (
        <Text size="sm" c="dimmed">
          {hasServiceType && <ServiceTypeDisplay appointment={appointment} inherit />}
          {hasServiceType && times && ' · '}
          {times}
        </Text>
      )}
      {getNonPatientActors(appointment).map((actor, index) => (
        <Group key={actor.reference ?? `actor-${index}`} gap="xs" wrap="nowrap">
          <ResourceName value={actor} link={false} size="sm" />
          {primary?.reference && actor.reference === primary.reference && (
            <Badge size="xs" variant="light">
              Primary
            </Badge>
          )}
        </Group>
      ))}
    </Stack>
  );
}

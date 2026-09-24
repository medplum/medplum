// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text, Title } from '@mantine/core';
import type { Appointment } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import type { AppointmentSlotGroup } from './AppointmentFinder.times';
import { formatDayHeading } from './AppointmentFinder.times';
import { AppointmentSlotGroupCard } from './AppointmentSlotGroupCard';

export interface AppointmentDayTimesProps {
  /** Local midnight of the day being shown, which titles it. */
  readonly date: Date;
  /** The times offered on that day, empty for a day that offers none. */
  readonly groups: readonly AppointmentSlotGroup[];
  readonly onSelectAppointment: (appointment: Appointment) => void;
  /** IANA timezone the times are read in. Defaults to the browser's. */
  readonly timezone?: string;
  readonly viewerTimezone?: string;
  readonly selected?: Appointment;
}

/**
 * Shows one day's available times, a card per set of actors offering them.
 *
 * Holds no calendar of its own, so that a view wanting only a list of times can
 * render it alone.
 *
 * @param props - The React props.
 * @returns The day's heading and its times.
 */
export function AppointmentDayTimes(props: AppointmentDayTimesProps): JSX.Element {
  const { date, groups, onSelectAppointment, timezone, viewerTimezone, selected } = props;

  return (
    <Stack gap="xs">
      <Title order={4}>{formatDayHeading(date)}</Title>
      {groups.length === 0 && <Text c="dimmed">No times are offered on this day.</Text>}
      {groups.map((group) => (
        <AppointmentSlotGroupCard
          key={group.key}
          group={group}
          timezone={timezone}
          viewerTimezone={viewerTimezone}
          selected={selected}
          onSelectAppointment={onSelectAppointment}
        />
      ))}
    </Stack>
  );
}

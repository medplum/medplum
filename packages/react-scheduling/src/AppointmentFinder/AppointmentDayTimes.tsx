// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text, Title } from '@mantine/core';
import type { Appointment } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import type { AppointmentDay } from './AppointmentFinder.times';
import { formatDayHeading } from './AppointmentFinder.times';
import { AppointmentSlotGroupCard } from './AppointmentSlotGroupCard';

export interface AppointmentDayTimesProps {
  /** Local midnight of the day being shown, which titles it. */
  readonly date: Date;
  /** The day's times, or undefined for a day that offers none. */
  readonly day: AppointmentDay | undefined;
  readonly onSelectAppointment: (appointment: Appointment) => void;
  /** IANA timezone the times are read in. Defaults to the browser's. */
  readonly timezone?: string;
  readonly selected?: Appointment;
}

/**
 * Shows one day's available times, a card per set of actors offering them.
 *
 * Split out from the picker so that times can be listed without a calendar
 * beside them, which is all some views want.
 *
 * @param props - The React props.
 * @returns The day's heading and its times.
 */
export function AppointmentDayTimes(props: AppointmentDayTimesProps): JSX.Element {
  const { date, day, onSelectAppointment, timezone, selected } = props;

  return (
    <Stack gap="xs">
      <Title order={4}>{formatDayHeading(date)}</Title>
      {!day && <Text c="dimmed">No times are offered on this day.</Text>}
      {day?.groups.map((group) => (
        <AppointmentSlotGroupCard
          key={group.key}
          group={group}
          timezone={timezone}
          selected={selected}
          onSelectAppointment={onSelectAppointment}
        />
      ))}
    </Stack>
  );
}

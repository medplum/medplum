// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { ReferenceDisplay } from '@medplum/react';
import type { JSX } from 'react';
import classes from './AppointmentFinder.module.css';
import { getActorRoleLabel } from './AppointmentFinder.roles';
import type { AppointmentSlotGroup } from './AppointmentFinder.times';
import { formatZonedTime, isViewerTimezone } from './AppointmentFinder.times';

export interface AppointmentSlotGroupCardProps {
  readonly group: AppointmentSlotGroup;
  readonly onSelectAppointment: (appointment: Appointment) => void;
  /** IANA timezone the times are shown in. Defaults to the browser's. */
  readonly timezone?: string;
  /** The viewer's own IANA timezone. Defaults to the browser's. */
  readonly viewerTimezone?: string;
  readonly selected?: Appointment;
  readonly disabled?: boolean;
}

/**
 * One card of available times, headed by the actors offering them.
 * @param props - The React props.
 * @returns The card.
 */
export function AppointmentSlotGroupCard(props: AppointmentSlotGroupCardProps): JSX.Element {
  const { group, onSelectAppointment, timezone, viewerTimezone, selected, disabled } = props;

  // Times are written with their zone only when that is not the zone the viewer is reading them in.
  const firstStart = group.appointments.find((appointment) => appointment.start)?.start;
  const withTimezone = !!firstStart && !isViewerTimezone(timezone, new Date(firstStart), viewerTimezone);

  return (
    <Paper withBorder p="md" data-testid={`slot-group-${group.key}`}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="sm">
        <Group gap="lg" align="flex-start" wrap="wrap">
          {group.actors.map((actor) => (
            <Stack key={getReferenceString(actor) ?? actor.display} gap={2}>
              {getActorRoleLabel(actor) && (
                <Text size="xs" c="dimmed" tt="uppercase">
                  {getActorRoleLabel(actor)}
                </Text>
              )}
              <Text size="sm" fw={500}>
                <ReferenceDisplay value={actor} link={false} />
              </Text>
            </Stack>
          ))}
        </Group>
        {group.durationMinutes > 0 && (
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {group.durationMinutes} min visit
          </Text>
        )}
      </Group>
      <Group gap="xs" className={classes.timeGrid}>
        {group.appointments.map((appointment) => {
          const isSelected = selected === appointment;
          return (
            <Button
              key={appointment.start}
              variant={isSelected ? 'filled' : 'outline'}
              size="sm"
              disabled={disabled}
              onClick={() => onSelectAppointment(appointment)}
            >
              {appointment.start ? formatZonedTime(new Date(appointment.start), timezone, { withTimezone }) : ''}
            </Button>
          );
        })}
      </Group>
    </Paper>
  );
}

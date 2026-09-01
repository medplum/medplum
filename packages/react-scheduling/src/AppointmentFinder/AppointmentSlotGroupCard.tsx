// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { ResourceName } from '@medplum/react';
import type { JSX } from 'react';
import classes from './AppointmentFinder.module.css';
import { getActorRoleLabel } from './AppointmentFinder.roles';
import type { AppointmentSlotGroup } from './AppointmentFinder.times';
import { formatZonedTime } from './AppointmentFinder.times';

export interface AppointmentSlotGroupCardProps {
  readonly group: AppointmentSlotGroup;
  readonly onSelectAppointment: (appointment: Appointment) => void;
  /** IANA timezone the times are shown in. Defaults to the browser's. */
  readonly timezone?: string;
  readonly selected?: Appointment;
  readonly disabled?: boolean;
}

/**
 * One card of available times, headed by the actors offering them.
 * @param props - The React props.
 * @returns The card.
 */
export function AppointmentSlotGroupCard(props: AppointmentSlotGroupCardProps): JSX.Element {
  const { group, onSelectAppointment, timezone, selected, disabled } = props;

  return (
    <Paper withBorder p="md" data-testid={`slot-group-${group.key}`}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="sm">
        <Group gap="lg" align="flex-start" wrap="wrap">
          {group.actors.map((actor, index) => {
            const roleLabel = getActorRoleLabel(actor);
            return (
              <Stack key={getReferenceString(actor) ?? index} gap={2}>
                {roleLabel && (
                  <Text size="xs" c="dimmed" tt="uppercase">
                    {roleLabel}
                  </Text>
                )}
                <Text size="sm" fw={500}>
                  {/* Not `ReferenceDisplay`, which prints `Reference.display` without
                      ever reading the resource behind it. */}
                  <ResourceName value={actor} link={false} inherit />
                </Text>
              </Stack>
            );
          })}
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
              {appointment.start ? formatZonedTime(new Date(appointment.start), timezone) : ''}
            </Button>
          );
        })}
      </Group>
    </Paper>
  );
}

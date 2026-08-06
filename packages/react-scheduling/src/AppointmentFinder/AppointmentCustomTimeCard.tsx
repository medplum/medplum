// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import type { Appointment, CodeableConcept } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useState } from 'react';
import classes from './AppointmentFinder.module.css';
import type { ActorCombination } from './AppointmentFinder.utils';
import {
  buildCustomAppointment,
  findAppointmentAt,
  formatDayHeading,
  formatZonedTime,
  getNativeInputType,
  parseZonedTime,
} from './AppointmentFinder.utils';

/** How a chosen time relates to what the server offered. */
export interface AppointmentSelectionOptions {
  /**
   * Whether the appointment is one `$find` offered. When false the times were
   * typed in and never checked against anybody's availability, so booking it may
   * double-book the actors: `$book` will refuse it, and the caller has to decide
   * whether to write the Appointment and its Slots anyway.
   */
  readonly available: boolean;
}

export interface AppointmentCustomTimeCardProps {
  /** Local midnight of the day the time falls on. */
  readonly day: Date;
  /** The ways the appointment could be held, from the actors already chosen. */
  readonly options: readonly ActorCombination[];
  readonly durationMinutes: number;
  readonly onSelectAppointment: (appointment: Appointment, options: AppointmentSelectionOptions) => void;
  /** The day's offered times, so a time that needs no override is recognised. */
  readonly offered?: readonly Appointment[];
  /** IANA timezone the entered time is read in. Defaults to the browser's. */
  readonly timezone?: string;
  /** `serviceType` to carry on the appointment, from `toServiceTypeCodeableConcepts`. */
  readonly serviceType?: CodeableConcept[];
  readonly disabled?: boolean;
}

interface PendingTime {
  readonly start: Date;
  readonly combination: ActorCombination;
}

/**
 * Takes a request for a time that was not offered.
 *
 * Availability is a rule about the usual case, and clinics have to be able to
 * work outside it — fitting an urgent visit into a full afternoon, or into the
 * gap a cancellation just left. So an entered time that matches an offered one
 * is treated as that offer, and one that matches nothing is only reported back
 * after saying plainly that it may double-book the people involved.
 *
 * @param props - The React props.
 * @returns The card, or null when there is nobody to hold the time on.
 */
export function AppointmentCustomTimeCard(props: AppointmentCustomTimeCardProps): JSX.Element | null {
  const { day, options, durationMinutes, onSelectAppointment, offered, timezone, serviceType, disabled } = props;

  const [time, setTime] = useState('');
  const [optionKey, setOptionKey] = useState<string>();
  const [pending, setPending] = useState<PendingTime>();
  const [error, setError] = useState<string>();

  if (options.length === 0) {
    return null;
  }

  const combination = options.find((option) => option.key === optionKey) ?? options[0];

  function reset(): void {
    setTime('');
    setPending(undefined);
    setError(undefined);
  }

  function handleSubmit(): void {
    const start = parseZonedTime(day, time, timezone);
    if (!start) {
      setPending(undefined);
      setError('Enter a time as HH:MM');
      return;
    }

    setError(undefined);

    // An entered time that happens to be on offer is that offer, `contained`
    // Slots and all, rather than a look-alike the caller cannot book.
    const match = findAppointmentAt(offered ?? [], start, combination.key);
    if (match) {
      reset();
      onSelectAppointment(match, { available: true });
      return;
    }

    setPending({ start, combination });
  }

  function handleConfirm(): void {
    if (!pending) {
      return;
    }
    const appointment = buildCustomAppointment({
      start: pending.start,
      durationMinutes,
      actors: pending.combination.actors,
      schedules: pending.combination.schedules,
      serviceType,
    });
    reset();
    onSelectAppointment(appointment, { available: false });
  }

  return (
    <Paper withBorder p="md" data-testid="custom-time-card">
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="sm">
        <Stack gap={2}>
          <Text size="sm" fw={500}>
            Another time
          </Text>
          <Text size="xs" c="dimmed">
            Ask for a time on {formatDayHeading(day)} that is not offered above.
          </Text>
        </Stack>
        {durationMinutes > 0 && (
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {durationMinutes} min visit
          </Text>
        )}
      </Group>

      <Group align="flex-end" gap="xs" className={classes.customTimeRow}>
        <TextInput
          name="custom-time"
          label="Time"
          type={getNativeInputType('time')}
          disabled={disabled}
          value={time}
          error={error}
          onChange={(event) => {
            setTime(event.currentTarget.value);
            setPending(undefined);
          }}
        />
        {options.length > 1 && (
          <Select
            name="custom-time-actors"
            label="With"
            allowDeselect={false}
            disabled={disabled}
            value={combination.key}
            data={options.map((option) => ({ value: option.key, label: option.label }))}
            onChange={(selected) => {
              setOptionKey(selected ?? undefined);
              setPending(undefined);
            }}
          />
        )}
        <Button variant="default" disabled={disabled || !time} onClick={handleSubmit}>
          Use this time
        </Button>
      </Group>

      {pending && (
        <Alert color="yellow" title="That time is not available" mt="sm">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">
              {formatZonedTime(pending.start, timezone)} on {formatDayHeading(day)} is not one of the times offered for{' '}
              {pending.combination.label}. Booking it may double-book them.
            </Text>
            <Group gap="xs">
              <Button color="yellow" onClick={handleConfirm}>
                Schedule anyway
              </Button>
              <Button variant="subtle" onClick={() => setPending(undefined)}>
                Cancel
              </Button>
            </Group>
          </Stack>
        </Alert>
      )}
    </Paper>
  );
}

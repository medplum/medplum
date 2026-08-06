// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Anchor, Loader, Stack, Text } from '@mantine/core';
import type { Appointment, CodeableConcept } from '@medplum/fhirtypes';
import { isSameDay } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { AppointmentSelectionOptions } from './AppointmentCustomTimeCard';
import { AppointmentCustomTimeCard } from './AppointmentCustomTimeCard';
import { AppointmentDayTimes } from './AppointmentDayTimes';
import type { ActorCombination } from './AppointmentFinder.utils';
import { groupAppointmentsByDay } from './AppointmentFinder.utils';

/** How many days of times are shown at once unless the caller says otherwise. */
const DEFAULT_DAYS_SHOWN = 1;

/** What a request for a time outside the offered ones would be booked against. */
export interface CustomTimeConfig {
  /** The ways the appointment could be held, from the actors already chosen. */
  readonly options: readonly ActorCombination[];
  /** The visit length to give a time that was not offered. */
  readonly durationMinutes: number;
  /** `serviceType` to carry on the appointment, from `toServiceTypeCodeableConcepts`. */
  readonly serviceType?: CodeableConcept[];
}

export interface AppointmentSlotPickerProps {
  /** Proposed appointments from `$find`. */
  readonly appointments: readonly Appointment[];
  readonly onSelectAppointment: (appointment: Appointment, options: AppointmentSelectionOptions) => void;
  /** IANA timezone the days and times are read in. Defaults to the browser's. */
  readonly timezone?: string;
  /**
   * Enables asking for a time that was not offered. Omit it to offer only what
   * `$find` returned.
   */
  readonly customTime?: CustomTimeConfig;
  /**
   * The day a request for a specific time falls on. Defaults to the first day
   * with times, which leaves nothing to ask about when the search came back
   * empty — the one case where asking matters most — so a caller enabling
   * `customTime` should name the day its search covers.
   */
  readonly customTimeDay?: Date;
  /**
   * How many days of times to show at once. Defaults to one: the answer a
   * scheduler is after is usually the soonest time that works, and one day of
   * times is a short enough list to take in without scrolling.
   */
  readonly daysShown?: number;
  /**
   * Identifies the search the appointments came from. Changing it closes a
   * request for a specific time, which belonged to the search it was opened from.
   */
  readonly searchKey?: string;
  readonly loading?: boolean;
  readonly error?: Error;
  readonly selected?: Appointment;
}

/**
 * Lists the available times a search found, a day at a time.
 *
 * One day is shown at a time, because the answer a scheduler is usually after —
 * the soonest time that works — is on the first day that has any, and a month of
 * times is a page nobody reads. Someone comparing days instead of taking the
 * first one says so by asking for a range, and the caller then sets `daysShown`
 * to the length of it. Which day is read is a question for whatever picks the
 * dates, so there is nothing here for walking through them.
 *
 * @param props - The React props.
 * @returns The days of times found.
 */
export function AppointmentSlotPicker(props: AppointmentSlotPickerProps): JSX.Element {
  const {
    appointments,
    onSelectAppointment,
    timezone,
    customTime,
    customTimeDay,
    daysShown = DEFAULT_DAYS_SHOWN,
    searchKey,
    loading,
    error,
    selected,
  } = props;

  const [askingForTime, setAskingForTime] = useState(false);

  const days = useMemo(() => groupAppointmentsByDay(appointments, timezone), [appointments, timezone]);
  const daysKey = useMemo(() => days.map((day) => day.key).join(','), [days]);
  // Falling back to the days themselves means a caller that does not identify
  // its searches still closes the request, at the cost of doing so whenever the
  // times change at all.
  const resetKey = searchKey ?? daysKey;

  useEffect(() => {
    setAskingForTime(false);
  }, [resetKey]);

  const shownDays = days.slice(0, Math.max(Math.floor(daysShown), 1));

  // Asking for a particular time is the rare way through, so it stays behind a
  // link — except when the search found nothing, where it is all that is left.
  const askDay = customTimeDay ?? days[0]?.date;
  const showCustomTime = !!customTime && !!askDay && (askingForTime || days.length === 0);

  return (
    <Stack data-testid="appointment-slot-day">
      {error && (
        <Alert color="red" title="Could not load available times">
          {error.message}
        </Alert>
      )}
      {loading && <Loader />}
      {!loading && !error && (
        <>
          {days.length === 0 && (
            <Text c="dimmed">No available times match this search. {getEmptyHint(showCustomTime)}</Text>
          )}

          {shownDays.map((day) => (
            <AppointmentDayTimes
              key={day.key}
              date={day.date}
              day={day}
              timezone={timezone}
              selected={selected}
              onSelectAppointment={(appointment) => onSelectAppointment(appointment, { available: true })}
            />
          ))}

          {customTime && askDay && !showCustomTime && (
            <Anchor
              component="button"
              type="button"
              size="xs"
              mt="xs"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setAskingForTime(true)}
            >
              Ask for a specific time
            </Anchor>
          )}

          {showCustomTime && askDay && customTime && (
            <AppointmentCustomTimeCard
              day={askDay}
              options={customTime.options}
              durationMinutes={customTime.durationMinutes}
              serviceType={customTime.serviceType}
              // Matched by calendar day rather than by instant, since the day
              // asked about comes from the caller and may carry a time of day.
              // A day read as having no times would present a time already on
              // offer as one that needs overriding.
              offered={days.find((day) => isSameDay(day.date, askDay))?.groups.flatMap((group) => group.appointments)}
              timezone={timezone}
              onSelectAppointment={onSelectAppointment}
            />
          )}
        </>
      )}
    </Stack>
  );
}

function getEmptyHint(invitesCustomTime: boolean): string {
  return invitesCustomTime
    ? 'Ask for a specific time below, or try another day.'
    : 'Try another day, or a different provider.';
}

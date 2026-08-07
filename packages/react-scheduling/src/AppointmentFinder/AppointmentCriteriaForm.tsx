// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Group, SegmentedControl, Stack, Text } from '@mantine/core';
import { CalendarDateInput, getStartMonth } from '@medplum/react';
import type { JSX } from 'react';
import { AppointmentActorSelect } from './AppointmentActorSelect';
import type { SchedulingRole } from './AppointmentFinder.roles';
import type { ActorSelections, ScheduleCandidateGroup } from './AppointmentFinder.schedules';
import { getSelectedCandidates, getSelectionError } from './AppointmentFinder.schedules';
import type { TimeOfDay } from './AppointmentFinder.times';
import { endOfMonth, formatDateRange, formatDayHeading } from './AppointmentFinder.times';

export interface AppointmentSearchCriteria {
  /** Chosen schedule ids per role. Everything chosen attends. */
  readonly actorSelections: ActorSelections;
  /** Earliest day to look at. Left out, the search starts as soon as possible. */
  readonly start?: Date;
  /** Latest day to look at. Left out, the search reaches on as far as asked. */
  readonly end?: Date;
  /**
   * The month the calendar is showing. Part of the search rather than of the
   * calendar's own state, because which days are marked as having times is
   * answered a month at a time. Defaults to the month the search opens in.
   */
  readonly month?: Date;
  readonly timeOfDay: TimeOfDay;
}

export interface AppointmentCriteriaFormProps {
  /** The questions to ask, one per role the service is booked against. */
  readonly groups: readonly ScheduleCandidateGroup[];
  readonly value: AppointmentSearchCriteria;
  readonly onChange: (value: AppointmentSearchCriteria) => void;
  /** Days with times on offer, marked on the calendar. */
  readonly availableDates?: readonly Date[];
  /**
   * How far the availability behind `availableDates` was actually checked. Short
   * of the month's end, the days past it are said to be unchecked rather than
   * left looking empty.
   */
  readonly availabilityCheckedThrough?: Date;
  /**
   * The earliest day worth asking about, usually now plus whatever notice the
   * service needs. Days before it cannot be picked, and the calendar will not page
   * back past the month it falls in.
   */
  readonly earliestDate?: Date;
  readonly disabled?: boolean;
}

/**
 * Collects the parameters of an availability search: which actors to hold the
 * appointment on, over what dates, at what time of day.
 *
 * Sits beside the times it produces rather than in front of them, so that
 * narrowing a search is a change to a list already on screen. A scheduler works
 * by elimination — this provider, then that room, then the week after next — and
 * that reads badly as a form to be filled in and submitted.
 *
 * The actor fields come from the schedules that can be booked for the service,
 * so a service held on providers and devices asks about both and a service held
 * on providers alone asks only about them.
 *
 * Each field takes several actors, and everything chosen attends: `$find`
 * intersects their schedules, so an appointment needing both a surgeon and an
 * anesthesiologist is asked for by naming both. Rooms and devices may be left
 * empty, which searches without holding one at all. There is no way to ask for
 * a choice between actors; that would be a request per combination.
 *
 * @param props - The React props.
 * @returns The search criteria fields.
 */
export function AppointmentCriteriaForm(props: AppointmentCriteriaFormProps): JSX.Element {
  const { groups, value, onChange, availableDates, disabled } = props;

  const chosenRange = formatDateRange({ start: value.start, end: value.end });
  const rangeError = getRangeError(value.start, value.end);
  const month = value.month ?? value.start ?? getStartMonth();
  const unchecked = getUncheckedFrom(month, props.availabilityCheckedThrough);

  function setActorSelection(role: SchedulingRole, selected: string[]): void {
    onChange({ ...value, actorSelections: { ...value.actorSelections, [role]: selected } });
  }

  return (
    <Stack>
      <div>
        <CalendarDateInput
          availableDates={availableDates ? [...availableDates] : []}
          month={month}
          // Only a day the user asked for is marked as chosen. Paging the months
          // moves what is being read, and marking whatever turned up in the new
          // month would put a choice in their mouth.
          selected={hasRange(value) ? undefined : value.start}
          range={hasRange(value) ? { start: value.start as Date, end: value.end as Date } : undefined}
          // A day with nothing on it can still be asked about, because the caller
          // may take a request for a specific time on it. A day that has already
          // gone cannot, which is what the earliest day rules out.
          allowUnavailableDates
          earliestDate={props.earliestDate}
          onChangeMonth={(next) => onChange({ ...value, month: next })}
          // Every click asks for that one day. Clicking a second day to mean
          // "through here" would make the same gesture mean two things depending
          // on what came before it, and a range is what dragging is for.
          onClick={(date) => onChange({ ...value, start: date, end: date })}
          onSelectRange={(start, end) => onChange({ ...value, start, end })}
        />
        {chosenRange && (
          <Group justify="space-between" gap="xs" mt={4} wrap="nowrap">
            <Text size="xs" c="dimmed">
              {chosenRange}
            </Text>
            <Anchor
              component="button"
              type="button"
              size="xs"
              onClick={() => onChange({ ...value, start: undefined, end: undefined })}
            >
              Clear
            </Anchor>
          </Group>
        )}
        {rangeError && (
          <Text size="xs" c="red" mt={2}>
            {rangeError}
          </Text>
        )}
        {!rangeError && !hasRange(value) && (
          <Text size="xs" c="dimmed" mt={2}>
            Drag across the calendar, or shift-click a second day, to search a range.
          </Text>
        )}
        {unchecked && (
          <Text size="xs" c="dimmed" mt={2}>
            Days marked as far as {formatDayHeading(unchecked)}. Later ones have too many times to check at once — pick
            one to see it.
          </Text>
        )}
      </div>

      <div>
        <Text size="sm" fw={500} mb={4} component="label" htmlFor="time-of-day">
          Time of day
        </Text>
        <SegmentedControl
          id="time-of-day"
          fullWidth
          disabled={disabled}
          value={value.timeOfDay}
          data={[
            { value: 'any', label: 'Any' },
            { value: 'morning', label: 'Morning' },
            { value: 'afternoon', label: 'Afternoon' },
          ]}
          onChange={(selected) => onChange({ ...value, timeOfDay: selected as TimeOfDay })}
        />
      </div>

      {groups.map((group) => {
        const selected = getSelectedCandidates(group, value.actorSelections);
        return (
          <AppointmentActorSelect
            key={group.role}
            group={group}
            disabled={disabled}
            error={group.required && selected.length === 0 ? `Choose at least one ${labelOf(group)}` : undefined}
            value={selected.map((candidate) => candidate.schedule.id)}
            onChange={(next) => setActorSelection(group.role, next)}
          />
        );
      })}

      {groups.length === 0 && (
        <Text size="sm" c="dimmed">
          No schedules are configured for this service.
        </Text>
      )}
    </Stack>
  );
}

function hasRange(value: AppointmentSearchCriteria): boolean {
  return !!value.start && !!value.end && value.start.getTime() !== value.end.getTime();
}

/**
 * Returns the first day the calendar's marks stop being trustworthy.
 *
 * A scan that came back full says nothing about the rest of the month, and days
 * it never reached are drawn the same as days with nothing on them. Rather than
 * let that read as "no availability", the form says where the marks stop.
 *
 * @param month - The month on display.
 * @param checkedThrough - How far the scan behind the marks reached.
 * @returns The last day marked, or undefined when the whole month was checked.
 */
function getUncheckedFrom(month: Date, checkedThrough: Date | undefined): Date | undefined {
  if (!checkedThrough) {
    return undefined;
  }
  return checkedThrough < endOfMonth(month) ? checkedThrough : undefined;
}

function labelOf(group: ScheduleCandidateGroup): string {
  return group.label.toLowerCase();
}

/**
 * Reports why a search cannot run from these criteria, if it cannot.
 *
 * Collected here so the form and the wizard's button agree on what is valid.
 *
 * @param groups - The roles offered by the form.
 * @param value - The current criteria.
 * @returns A message describing the problem, or undefined when the search can run.
 */
export function getCriteriaError(
  groups: readonly ScheduleCandidateGroup[],
  value: AppointmentSearchCriteria
): string | undefined {
  return getSelectionError(groups, value.actorSelections) ?? getRangeError(value.start, value.end);
}

/**
 * Checks that a date range runs forwards.
 *
 * The calendar cannot produce a backwards range, but a caller opening the finder
 * on dates of its own can.
 *
 * How long the range is does not matter: a range longer than the 31 days `$find`
 * accepts is searched a page at a time rather than refused.
 *
 * @param start - Start of the range, if there is one.
 * @param end - End of the range, if there is one.
 * @returns A message to show, or undefined when valid.
 */
export function getRangeError(start: Date | undefined, end: Date | undefined): string | undefined {
  if (start && end && end < start) {
    return 'The end date must be after the start date';
  }
  return undefined;
}

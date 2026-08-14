// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group } from '@mantine/core';
import cx from 'clsx';
import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import classes from './CalendarDateInput.module.css';
import { getMonthString, getStartMonth, isBeforeDay, isSameDay, startOfMonth } from './CalendarDateInput.utils';

export interface CalendarDateInputProps {
  readonly availableDates: Date[];
  readonly onChangeMonth: (date: Date) => void;
  readonly onClick: (date: Date) => void;
  readonly month?: Date;
  readonly selected?: Date;
  readonly allowUnavailableDates?: boolean;
  readonly earliestDate?: Date;
  readonly range?: { readonly start: Date; readonly end: Date };
  readonly onSelectRange?: (start: Date, end: Date) => void;
}

interface CalendarCell {
  readonly date: Date;
  readonly available: boolean;
}

type OptionalCalendarCell = CalendarCell | undefined;

export function CalendarDateInput(props: CalendarDateInputProps): JSX.Element {
  const { onChangeMonth, onClick, onSelectRange, allowUnavailableDates, earliestDate } = props;
  const [uncontrolledMonth, setUncontrolledMonth] = useState<Date>(getStartMonth);
  const shownMonth = props.month ?? uncontrolledMonth;
  const year = shownMonth.getFullYear();
  const monthIndex = shownMonth.getMonth();
  const month = useMemo(() => new Date(year, monthIndex, 1), [year, monthIndex]);
  const atEarliestMonth = !!earliestDate && month <= startOfMonth(earliestDate);

  const [dragFrom, setDragFrom] = useState<Date>();
  const [dragTo, setDragTo] = useState<Date>();
  // Set when a drag has just ended, to swallow the click that follows it.
  const dragged = useRef(false);

  function moveMonth(delta: number): void {
    const newMonth = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    if (props.month === undefined) {
      setUncontrolledMonth(newMonth);
    }
    onChangeMonth(newMonth);
  }

  function isDayDisabled(day: CalendarCell): boolean {
    return (!day.available && !allowUnavailableDates) || (!!earliestDate && isBeforeDay(day.date, earliestDate));
  }

  // Released anywhere, because a drag that ends off the calendar is still a drag
  // the user finished, and one left hanging would follow the pointer around.
  useEffect(() => {
    if (!dragFrom) {
      return undefined;
    }
    function finish(): void {
      if (dragFrom && dragTo && !isSameDay(dragFrom, dragTo)) {
        dragged.current = true;
        const { start, end } = sortEnds(dragFrom, dragTo);
        onSelectRange?.(start, end);
      }
      setDragFrom(undefined);
      setDragTo(undefined);
    }
    window.addEventListener('pointerup', finish);
    return () => window.removeEventListener('pointerup', finish);
  }, [dragFrom, dragTo, onSelectRange]);

  // A drag in progress is drawn as the range it would ask for, so that what is
  // being dragged out looks like what releasing will leave behind.
  const dragging = dragFrom && dragTo ? sortEnds(dragFrom, dragTo) : undefined;
  const range = dragging ?? props.range;
  // Both ends of a range are chosen days; a single day stands alone.
  const selected = range ? undefined : props.selected;

  const grid = useMemo(() => buildGrid(month, props.availableDates), [month, props.availableDates]);

  return (
    <div>
      <Group justify="space-between" gap="xs" grow wrap="nowrap">
        <p style={{ flex: 1 }}>{getMonthString(month)}</p>
        <Group justify="flex-end" gap="xs">
          <Button
            variant="outline"
            aria-label="Previous month"
            disabled={atEarliestMonth}
            onClick={() => moveMonth(-1)}
          >
            &lt;
          </Button>
          <Button variant="outline" aria-label="Next month" onClick={() => moveMonth(1)}>
            &gt;
          </Button>
        </Group>
      </Group>
      <table className={classes.table}>
        <thead>
          <tr>
            <th>SUN</th>
            <th>MON</th>
            <th>TUE</th>
            <th>WED</th>
            <th>THU</th>
            <th>FRI</th>
            <th>SAT</th>
          </tr>
        </thead>
        <tbody>
          {grid.map((week, weekIndex) => (
            <tr key={'week-' + weekIndex}>
              {week.map((day, dayIndex) => (
                <td
                  key={'day-' + dayIndex}
                  className={cx(
                    day &&
                      range &&
                      day.date >= range.start &&
                      day.date <= range.end && [
                        classes.inRange,
                        // The band is drawn per row, so it is rounded off where the
                        // range ends and squared where it carries on to the next
                        // week.
                        (isSameDay(day.date, range.start) || dayIndex === 0) && classes.rangeOpens,
                        (isSameDay(day.date, range.end) || dayIndex === week.length - 1) && classes.rangeCloses,
                      ]
                  )}
                >
                  {day && (
                    <Button
                      variant="light"
                      className={cx(
                        day.available && classes.available,
                        isRangeEnd(day.date, range, selected) && classes.selected
                      )}
                      aria-pressed={selected || range ? isChosen(day.date, range, selected) : undefined}
                      disabled={isDayDisabled(day)}
                      onPointerDown={() => {
                        // A press begins a fresh gesture, so any drag still
                        // waiting to have its click swallowed is spent. A drag
                        // across days is released as a click on the row or table
                        // its ends share, never on a day, so the handler below
                        // cannot be relied on to clear this.
                        dragged.current = false;
                        if (onSelectRange) {
                          setDragFrom(day.date);
                          setDragTo(day.date);
                        }
                      }}
                      // Over rather than enter, which React only reports by way of
                      // this same event anyway.
                      onPointerOver={() => {
                        if (dragFrom) {
                          setDragTo(day.date);
                        }
                      }}
                      onClick={(event) => {
                        // A drag that crossed days has already asked for them, and
                        // the browser reports the release as a click as well.
                        if (dragged.current) {
                          dragged.current = false;
                          return;
                        }
                        const anchor = props.selected ?? props.range?.start;
                        if (event.shiftKey && anchor && onSelectRange && !isSameDay(anchor, day.date)) {
                          const ends = sortEnds(anchor, day.date);
                          onSelectRange(ends.start, ends.end);
                          return;
                        }
                        onClick(day.date);
                      }}
                    >
                      {day.date.getDate()}
                    </Button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Puts the ends of a drag in order.
 *
 * Dragging backwards is as natural as forwards — a scheduler working back from a
 * deadline starts at the far end — so the ends are sorted rather than the drag
 * being refused.
 *
 * @param from - The day the drag began on.
 * @param to - The day it has reached.
 * @returns The earlier day as the start.
 */
function sortEnds(from: Date, to: Date): { start: Date; end: Date } {
  return from <= to ? { start: from, end: to } : { start: to, end: from };
}

type DayRange = CalendarDateInputProps['range'];

/**
 * Returns whether a day is one of the two a range is anchored on.
 *
 * The ends are drawn as chosen days and the days between them as a band, so
 * this is what tells one from the other.
 *
 * @param date - Local midnight of the day in question.
 * @param range - The stretch of days asked for, if there is one.
 * @param selected - The single day chosen, if there is one.
 * @returns True when the day is an end of the range, or the day chosen.
 */
function isRangeEnd(date: Date, range: DayRange, selected: Date | undefined): boolean {
  return isSameDay(date, selected) || (!!range && (isSameDay(date, range.start) || isSameDay(date, range.end)));
}

/**
 * Returns whether a day is part of what has been chosen.
 *
 * Every day of a range counts, not just its ends: three days asked for are three
 * days chosen, and a reader told that the middle one is not selected would be
 * told something untrue.
 *
 * @param date - Local midnight of the day in question.
 * @param range - The stretch of days asked for, if there is one.
 * @param selected - The single day chosen, if there is one.
 * @returns True when the day falls within what is chosen.
 */
function isChosen(date: Date, range: DayRange, selected: Date | undefined): boolean {
  return isRangeEnd(date, range, selected) || (!!range && date > range.start && date < range.end);
}

function buildGrid(startDate: Date, availableDates: Date[]): OptionalCalendarCell[][] {
  const d = new Date(startDate.getFullYear(), startDate.getMonth());
  const grid: OptionalCalendarCell[][] = [];
  let row: OptionalCalendarCell[] = [];

  // Fill leading empty days
  for (let i = 0; i < d.getDay(); i++) {
    row.push(undefined);
  }

  while (d.getMonth() === startDate.getMonth()) {
    row.push({
      date: new Date(d),
      available: isDayAvailable(d, availableDates),
    });

    if (d.getDay() === 6) {
      grid.push(row);
      row = [];
    }

    d.setDate(d.getDate() + 1);
  }

  // Fill trailing empty days
  if (d.getDay() !== 0) {
    for (let i = d.getDay(); i < 7; i++) {
      row.push(undefined);
    }
    grid.push(row);
  }

  return grid;
}

/**
 * Returns true if the given date is available for booking.
 * @param day - The day to check.
 * @param availableDates - The list of available dates.
 * @returns True if there are any available slots for the day.
 */
function isDayAvailable(day: Date, availableDates: Date[]): boolean {
  // Note that slot start and end time may or may not be in UTC.
  return availableDates.some((availableDate) => isSameDay(availableDate, day));
}

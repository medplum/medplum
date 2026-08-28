// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { formatTimezoneLabel, isViewerTimezone } from '../AppointmentFinder/AppointmentFinder.times';

/** How many calendars are named before the rest are counted instead. */
const MAX_NAMED = 3;

/** One calendar on show, and the timezone it is scheduled in. */
export interface CalendarTimezoneNoticeCalendar {
  readonly id: string;
  readonly label: string;
  /** IANA timezone identifier the calendar is scheduled in. */
  readonly timezone: string;
}

export interface CalendarTimezoneNoticeProps {
  /** The calendars on show whose timezone is known. Exclude any whose timezone is unknown. */
  readonly calendars: readonly CalendarTimezoneNoticeCalendar[];
  /** The viewer's own IANA timezone. Defaults to the browser's. */
  readonly viewerTimezone?: string;
}

/**
 * Warns when the calendar's contents are not all in the same timezone as the viewer's.
 * @param props - The React props.
 * @returns The notice, or nothing when no calendar is on another clock.
 */
export function CalendarTimezoneNotice(props: CalendarTimezoneNoticeProps): JSX.Element | null {
  const { calendars, viewerTimezone } = props;

  const elsewhere = calendars.filter((calendar) => !isViewerTimezone(calendar.timezone, viewerTimezone));
  if (elsewhere.length === 0) {
    return null;
  }

  const viewerLabel = formatTimezoneLabel(viewerTimezone);

  return (
    <Group gap={6} wrap="nowrap" align="center" mt="xs" data-testid="calendar-timezone-notice">
      <IconInfoCircle size={14} stroke={1.8} />
      <Text size="xs" c="dimmed">
        Calendar shown in your local time ({viewerLabel}). {describeElsewhere(elsewhere)}
      </Text>
    </Group>
  );
}

/**
 * Names the calendars kept on another clock, counting the rest once the list would run long.
 * @param elsewhere - The calendars on another clock, at least one.
 * @returns The sentence naming them.
 */
function describeElsewhere(elsewhere: readonly CalendarTimezoneNoticeCalendar[]): string {
  const named = elsewhere
    .slice(0, MAX_NAMED)
    .map((calendar) => `${calendar.label} (${formatTimezoneLabel(calendar.timezone)})`);
  const remaining = elsewhere.length - named.length;
  if (remaining > 0) {
    named.push(`${remaining} ${remaining === 1 ? 'other' : 'others'}`);
  }

  const subject = joinWithAnd(named);
  return `${subject} ${elsewhere.length === 1 ? 'is' : 'are'} scheduled in other time zones.`;
}

function joinWithAnd(names: readonly string[]): string {
  if (names.length === 1) {
    return names[0];
  }
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

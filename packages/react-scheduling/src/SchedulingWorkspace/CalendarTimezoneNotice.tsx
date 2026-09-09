// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { formatTimezoneLabel, isViewerTimezone } from '../AppointmentFinder/AppointmentFinder.times';

export interface CalendarTimezoneNoticeProps {
  /** IANA timezones of the calendars on show whose timezone is known. Exclude any that are unknown. */
  readonly timezones: readonly string[];
  /** The viewer's own IANA timezone. Defaults to the browser's. */
  readonly viewerTimezone?: string;
  readonly className?: string;
}

/**
 * Warns when the calendar's contents are not all in the same timezone as the viewer's.
 * @param props - The React props.
 * @returns The notice, or nothing when every calendar is on the viewer's own clock.
 */
export function CalendarTimezoneNotice(props: CalendarTimezoneNoticeProps): JSX.Element | null {
  const { timezones, viewerTimezone, className } = props;

  const elsewhere = timezones.some((timezone) => !isViewerTimezone(timezone, viewerTimezone));
  if (!elsewhere) {
    return null;
  }

  const viewerLabel = formatTimezoneLabel(viewerTimezone);

  return (
    <Group gap={6} wrap="nowrap" align="center" className={className} data-testid="calendar-timezone-notice">
      <IconInfoCircle size={14} stroke={1.8} color="var(--mantine-color-dimmed)" />
      <Text size="xs" c="dimmed">
        Calendar shown in your local time ({viewerLabel}).
      </Text>
    </Group>
  );
}

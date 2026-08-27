// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import type { CalendarTimezoneNoticeCalendar } from './CalendarTimezoneNotice';
import { CalendarTimezoneNotice } from './CalendarTimezoneNotice';

export default {
  title: 'Medplum/SchedulingWorkspace/CalendarTimezoneNotice',
  component: CalendarTimezoneNotice,
} as Meta;

const PACIFIC = 'America/Los_Angeles';

/** A summer instant, so the zones below read as their daylight saving selves. */
const AT = new Date('2026-07-27T16:00:00.000Z');

const calendars: CalendarTimezoneNoticeCalendar[] = [
  { id: 'rivera', label: 'Dr. Maya Rivera', timezone: 'America/New_York' },
  { id: 'okafor', label: 'Dr. Tunde Okafor', timezone: 'America/Chicago' },
  { id: 'ultrasound', label: 'Ultrasound 1', timezone: 'America/Denver' },
  { id: 'room-a', label: 'Exam Room A', timezone: 'America/New_York' },
];

/**
 * One calendar kept somewhere else, seen from Pacific time.
 * @returns The notice.
 */
export const OneCalendarElsewhere = (): JSX.Element => (
  <CalendarTimezoneNotice calendars={calendars.slice(0, 1)} at={AT} viewerTimezone={PACIFIC} />
);

/**
 * Enough of them that the tail is counted rather than named.
 * @returns The notice.
 */
export const SeveralCalendarsElsewhere = (): JSX.Element => (
  <CalendarTimezoneNotice calendars={calendars} at={AT} viewerTimezone={PACIFIC} />
);

/**
 * The ordinary case: everything is kept on the viewer's own clock, so there is nothing to
 * disambiguate and the notice renders nothing at all.
 * @returns Nothing.
 */
export const NothingToSay = (): JSX.Element => (
  <CalendarTimezoneNotice
    calendars={[{ id: 'rivera', label: 'Dr. Maya Rivera', timezone: PACIFIC }]}
    at={AT}
    viewerTimezone={PACIFIC}
  />
);

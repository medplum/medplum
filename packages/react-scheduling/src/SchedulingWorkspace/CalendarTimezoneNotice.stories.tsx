// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { CalendarTimezoneNotice } from './CalendarTimezoneNotice';

export default {
  title: 'Medplum/SchedulingWorkspace/CalendarTimezoneNotice',
  component: CalendarTimezoneNotice,
} as Meta;

const PACIFIC = 'America/Los_Angeles';

/**
 * One calendar kept somewhere else, seen from Pacific time.
 * @returns The notice.
 */
export const CalendarElsewhere = (): JSX.Element => (
  <CalendarTimezoneNotice timezones={['America/New_York']} viewerTimezone={PACIFIC} />
);

/**
 * Several calendars, some kept elsewhere. The notice still just names the viewer's own zone.
 * @returns The notice.
 */
export const SeveralCalendarsElsewhere = (): JSX.Element => (
  <CalendarTimezoneNotice
    timezones={['America/New_York', 'America/Chicago', 'America/Denver', 'America/New_York']}
    viewerTimezone={PACIFIC}
  />
);

/**
 * The ordinary case: everything is kept on the viewer's own clock, so there is nothing to
 * disambiguate and the notice renders nothing at all.
 * @returns Nothing.
 */
export const NothingToSay = (): JSX.Element => (
  <CalendarTimezoneNotice timezones={[PACIFIC]} viewerTimezone={PACIFIC} />
);

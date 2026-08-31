// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '../test-utils/render';
import { CalendarTimezoneNotice } from './CalendarTimezoneNotice';

const EASTERN = 'America/New_York';
const PACIFIC = 'America/Los_Angeles';

describe('CalendarTimezoneNotice', () => {
  test('Says nothing when every calendar is scheduled in the viewer’s zone', () => {
    render(<CalendarTimezoneNotice timezones={[EASTERN]} viewerTimezone={EASTERN} />);

    expect(screen.queryByTestId('calendar-timezone-notice')).toBeNull();
  });

  test('Names the viewer’s zone when a calendar is kept in another', () => {
    render(<CalendarTimezoneNotice timezones={[EASTERN]} viewerTimezone={PACIFIC} />);

    expect(screen.getByTestId('calendar-timezone-notice')).toHaveTextContent('Calendar shown in your local time (PT).');
  });

  test('Says nothing when every calendar shares the viewer’s zone, even with several of them', () => {
    render(<CalendarTimezoneNotice timezones={[PACIFIC, PACIFIC]} viewerTimezone={PACIFIC} />);

    expect(screen.queryByTestId('calendar-timezone-notice')).toBeNull();
  });

  test('Still warns when only one of several calendars is kept elsewhere', () => {
    render(<CalendarTimezoneNotice timezones={[EASTERN, PACIFIC]} viewerTimezone={PACIFIC} />);

    expect(screen.getByTestId('calendar-timezone-notice')).toHaveTextContent('Calendar shown in your local time (PT).');
  });

  test('Warns for a zone that shares the viewer’s clock for part of the year', () => {
    // Arizona reads as Pacific all summer, but the notice still warns, so what it says does not
    // change under the reader twice a year.
    render(<CalendarTimezoneNotice timezones={['America/Phoenix']} viewerTimezone={PACIFIC} />);

    expect(screen.getByTestId('calendar-timezone-notice')).toHaveTextContent('Calendar shown in your local time (PT).');
  });
});

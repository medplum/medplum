// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '../test-utils/render';
import type { CalendarTimezoneNoticeCalendar } from './CalendarTimezoneNotice';
import { CalendarTimezoneNotice } from './CalendarTimezoneNotice';

const EASTERN = 'America/New_York';
const PACIFIC = 'America/Los_Angeles';
const CENTRAL = 'America/Chicago';
const MOUNTAIN = 'America/Denver';

function calendar(label: string, timezone: string): CalendarTimezoneNoticeCalendar {
  return { id: `${label}/${timezone}`, label, timezone };
}

describe('CalendarTimezoneNotice', () => {
  test('Says nothing when every calendar is scheduled in the viewer’s zone', () => {
    render(<CalendarTimezoneNotice calendars={[calendar('Dr. Alice Smith', EASTERN)]} viewerTimezone={EASTERN} />);

    expect(screen.queryByTestId('calendar-timezone-notice')).toBeNull();
  });

  test('Names the viewer’s zone and the calendar not kept in it', () => {
    render(<CalendarTimezoneNotice calendars={[calendar('Dr. Alice Smith', EASTERN)]} viewerTimezone={PACIFIC} />);

    expect(screen.getByTestId('calendar-timezone-notice')).toHaveTextContent(
      'Calendar shown in your local time (PT). Dr. Alice Smith (ET) is scheduled in other time zones.'
    );
  });

  test('Leaves out the calendars that are in the viewer’s zone', () => {
    render(
      <CalendarTimezoneNotice
        calendars={[calendar('Dr. Alice Smith', EASTERN), calendar('Dr. Bob Jones', PACIFIC)]}
        viewerTimezone={PACIFIC}
      />
    );

    const notice = screen.getByTestId('calendar-timezone-notice');
    expect(notice).toHaveTextContent('Dr. Alice Smith (ET) is scheduled');
    expect(notice).not.toHaveTextContent('Dr. Bob Jones');
  });

  test('Counts the rest once naming them all would run long', () => {
    render(
      <CalendarTimezoneNotice
        calendars={[
          calendar('Dr. Alice Smith', EASTERN),
          calendar('Room 3', CENTRAL),
          calendar('Ultrasound 1', MOUNTAIN),
          calendar('Dr. Carol Ray', EASTERN),
          calendar('Room 4', CENTRAL),
        ]}
        viewerTimezone={PACIFIC}
      />
    );

    expect(screen.getByTestId('calendar-timezone-notice')).toHaveTextContent(
      'Dr. Alice Smith (ET), Room 3 (CT), Ultrasound 1 (MT) and 2 others are scheduled in other time zones.'
    );
  });

  test('Names a zone that shares the viewer’s clock for part of the year', () => {
    // Arizona reads as Pacific all summer. The notice still names it, so what it says does not
    // change under the reader twice a year.
    render(
      <CalendarTimezoneNotice calendars={[calendar('Imaging Center', 'America/Phoenix')]} viewerTimezone={PACIFIC} />
    );

    expect(screen.getByTestId('calendar-timezone-notice')).toHaveTextContent('Imaging Center (MST)');
  });
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '../test-utils/render';
import type { CalendarTimezoneNoticeCalendar } from './CalendarTimezoneNotice';
import { CalendarTimezoneNotice } from './CalendarTimezoneNotice';

const EASTERN = 'America/New_York';
const PACIFIC = 'America/Los_Angeles';
const CENTRAL = 'America/Chicago';
const MOUNTAIN = 'America/Denver';

/** A summer instant, so the zones below are all on daylight saving time. */
const AT = new Date('2026-07-27T13:00:00.000Z');

function calendar(label: string, timezone: string): CalendarTimezoneNoticeCalendar {
  return { id: `${label}/${timezone}`, label, timezone };
}

describe('CalendarTimezoneNotice', () => {
  test('Says nothing when every calendar keeps the time the viewer reads', () => {
    render(
      <CalendarTimezoneNotice calendars={[calendar('Dr. Alice Smith', EASTERN)]} at={AT} viewerTimezone={EASTERN} />
    );

    expect(screen.queryByTestId('calendar-timezone-notice')).toBeNull();
  });

  test('Says nothing about a calendar named for another zone on the same clock', () => {
    // One clock under two names is not something anybody needs warning about.
    render(
      <CalendarTimezoneNotice
        calendars={[calendar('Dr. Alice Smith', 'America/Toronto')]}
        at={AT}
        viewerTimezone={EASTERN}
      />
    );

    expect(screen.queryByTestId('calendar-timezone-notice')).toBeNull();
  });

  test('Names the viewer’s clock and the calendar not kept on it', () => {
    render(
      <CalendarTimezoneNotice calendars={[calendar('Dr. Alice Smith', EASTERN)]} at={AT} viewerTimezone={PACIFIC} />
    );

    expect(screen.getByTestId('calendar-timezone-notice')).toHaveTextContent(
      'Calendar shown in your local time (PT). Dr. Alice Smith (ET) is scheduled in other time zones.'
    );
  });

  test('Leaves out the calendars that are on the viewer’s clock', () => {
    render(
      <CalendarTimezoneNotice
        calendars={[calendar('Dr. Alice Smith', EASTERN), calendar('Dr. Bob Jones', PACIFIC)]}
        at={AT}
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
        at={AT}
        viewerTimezone={PACIFIC}
      />
    );

    expect(screen.getByTestId('calendar-timezone-notice')).toHaveTextContent(
      'Dr. Alice Smith (ET), Room 3 (CT), Ultrasound 1 (MT) and 2 others are scheduled in other time zones.'
    );
  });

  test('Reads the zones at the instant it is given', () => {
    // Arizona keeps standard time all year, so it is Pacific's own clock in July and an hour
    // ahead of it in January. The same calendar list has to answer differently.
    const calendars = [calendar('Imaging Center', 'America/Phoenix')];

    const { unmount } = render(<CalendarTimezoneNotice calendars={calendars} at={AT} viewerTimezone={PACIFIC} />);
    expect(screen.queryByTestId('calendar-timezone-notice')).toBeNull();
    unmount();

    render(
      <CalendarTimezoneNotice
        calendars={calendars}
        at={new Date('2026-01-27T13:00:00.000Z')}
        viewerTimezone={PACIFIC}
      />
    );
    expect(screen.getByTestId('calendar-timezone-notice')).toHaveTextContent('Imaging Center (MST)');
  });
});

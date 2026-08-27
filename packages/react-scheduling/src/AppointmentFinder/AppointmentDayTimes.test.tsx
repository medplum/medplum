// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { buildProposedAppointment } from '../stories/scheduling';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { AppointmentDayTimes } from './AppointmentDayTimes';
import { groupAppointmentsByDay } from './AppointmentFinder.times';

const EASTERN = 'America/New_York';

/** 9:00 and 9:30 Eastern on the 27th. */
const MORNING = '2026-07-27T13:00:00.000Z';
const LATER = '2026-07-27T13:30:00.000Z';

describe('AppointmentDayTimes', () => {
  test("Lists a day's times without a calendar", async () => {
    const onSelectAppointment = vi.fn();
    const [day] = groupAppointmentsByDay(
      [buildProposedAppointment({ start: MORNING }), buildProposedAppointment({ start: LATER })],
      EASTERN
    );

    render(
      <AppointmentDayTimes
        date={day.date}
        groups={day.groups}
        timezone={EASTERN}
        onSelectAppointment={onSelectAppointment}
      />
    );

    expect(screen.getByText('Monday, July 27')).toBeInTheDocument();
    await act(async () => {
      // Named with its zone, because the runner is not on Eastern time.
      fireEvent.click(screen.getByRole('button', { name: '9:30 AM EDT' }));
    });

    expect(onSelectAppointment).toHaveBeenCalledTimes(1);
  });

  test('Leaves the zone off times the viewer already reads on their own clock', () => {
    const [day] = groupAppointmentsByDay([buildProposedAppointment({ start: MORNING })], EASTERN);

    render(
      <AppointmentDayTimes
        date={day.date}
        groups={day.groups}
        timezone={EASTERN}
        viewerTimezone={EASTERN}
        onSelectAppointment={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '9:00 AM' })).toBeInTheDocument();
  });

  test("Names the zone when the site does not keep the viewer's time", () => {
    const [day] = groupAppointmentsByDay([buildProposedAppointment({ start: MORNING })], EASTERN);

    render(
      <AppointmentDayTimes
        date={day.date}
        groups={day.groups}
        timezone={EASTERN}
        viewerTimezone="America/Los_Angeles"
        onSelectAppointment={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '9:00 AM EDT' })).toBeInTheDocument();
  });

  test('Says so on a day that offers nothing', () => {
    render(<AppointmentDayTimes date={new Date(2026, 6, 28)} groups={[]} onSelectAppointment={vi.fn()} />);

    expect(screen.getByText('Tuesday, July 28')).toBeInTheDocument();
    expect(screen.getByText('No times are offered on this day.')).toBeInTheDocument();
  });
});

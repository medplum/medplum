// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { buildProposedAppointment } from '../stories/scheduling';
import { act, fireEvent, renderWithMedplum, screen } from '../test-utils/render';
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

    renderWithMedplum(
      <AppointmentDayTimes
        date={day.date}
        groups={day.groups}
        timezone={EASTERN}
        onSelectAppointment={onSelectAppointment}
      />,
      new MockClient()
    );

    expect(screen.getByText('Monday, July 27')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '9:30 AM' }));
    });

    expect(onSelectAppointment).toHaveBeenCalledTimes(1);
  });

  test('Says so on a day that offers nothing', () => {
    renderWithMedplum(
      <AppointmentDayTimes date={new Date(2026, 6, 28)} groups={[]} onSelectAppointment={vi.fn()} />,
      new MockClient()
    );

    expect(screen.getByText('Tuesday, July 28')).toBeInTheDocument();
    expect(screen.getByText('No times are offered on this day.')).toBeInTheDocument();
  });
});

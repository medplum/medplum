// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { buildProposedAppointment } from '../stories/scheduling';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { AppointmentDayTimes } from './AppointmentDayTimes';
import { groupAppointmentsByDay } from './AppointmentFinder.times';

const medplum = new MockClient();

// The actor names on a card are resolved through the client.
const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
  <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
);

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
      />,
      wrapper
    );

    expect(screen.getByText('Monday, July 27')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '9:30 AM' }));
    });

    expect(onSelectAppointment).toHaveBeenCalledTimes(1);
  });

  test('Says so on a day that offers nothing', () => {
    render(<AppointmentDayTimes date={new Date(2026, 6, 28)} groups={[]} onSelectAppointment={vi.fn()} />, wrapper);

    expect(screen.getByText('Tuesday, July 28')).toBeInTheDocument();
    expect(screen.getByText('No times are offered on this day.')).toBeInTheDocument();
  });
});

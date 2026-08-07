// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Appointment } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { buildProposedAppointment } from '../stories/scheduling';
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { AppointmentCustomTimeCardProps } from './AppointmentCustomTimeCard';
import { AppointmentCustomTimeCard } from './AppointmentCustomTimeCard';
import type { ActorCombination } from './AppointmentFinder.schedules';
import { getActorsKey } from './AppointmentFinder.times';

const EASTERN = 'America/New_York';

/** Monday 27 July 2026, the day the card is taking a time on. */
const DAY = new Date(2026, 6, 27);

const RIVERA: ActorCombination = {
  key: getActorsKey([{ reference: 'Practitioner/dr-rivera' }]),
  label: 'Dr. Maya Rivera',
  actors: [{ reference: 'Practitioner/dr-rivera', display: 'Dr. Maya Rivera' }],
  schedules: [{ reference: 'Schedule/schedule-dr-rivera' }],
};

const OKAFOR: ActorCombination = {
  key: getActorsKey([{ reference: 'Practitioner/dr-okafor' }]),
  label: 'Dr. Tunde Okafor',
  actors: [{ reference: 'Practitioner/dr-okafor', display: 'Dr. Tunde Okafor' }],
  schedules: [{ reference: 'Schedule/schedule-dr-okafor' }],
};

const medplum = new MockClient();

function setup(props: Partial<AppointmentCustomTimeCardProps>): void {
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );
  render(
    <AppointmentCustomTimeCard
      day={DAY}
      options={[RIVERA]}
      durationMinutes={30}
      timezone={EASTERN}
      onSelectAppointment={vi.fn()}
      {...props}
    />,
    wrapper
  );
}

async function enterTime(time: string): Promise<void> {
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Time' }), { target: { value: time } });
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Use this time' }));
  });
}

describe('AppointmentCustomTimeCard', () => {
  test('Shows how long the visit would be', () => {
    setup({ durationMinutes: 45 });
    expect(screen.getByText('45 min visit')).toBeInTheDocument();
  });

  test('Hands back the server’s own proposal when the time is on offer', async () => {
    // 13:00 UTC is 9:00 on the clinic's Eastern clock.
    const offered = buildProposedAppointment({
      start: '2026-07-27T13:00:00.000Z',
      actorReferences: ['Practitioner/dr-rivera'],
      scheduleReferences: ['Schedule/schedule-dr-rivera'],
    });
    const onSelectAppointment = vi.fn();
    setup({ offered: [offered], onSelectAppointment });

    await enterTime('09:00');

    expect(screen.queryByText('That time is not available')).not.toBeInTheDocument();
    expect(onSelectAppointment).toHaveBeenCalledWith(offered, { available: true });
  });

  test('Warns before handing back a time nobody offered', async () => {
    const onSelectAppointment = vi.fn();
    setup({ offered: [], onSelectAppointment });

    await enterTime('09:15');

    expect(screen.getByText('That time is not available')).toBeInTheDocument();
    expect(screen.getByText(/9:15 AM on Monday, July 27 is not one of the times offered/)).toBeInTheDocument();
    expect(screen.getByText(/Booking it may double-book them/)).toBeInTheDocument();
    // Nothing is reported until the warning has been read and accepted.
    expect(onSelectAppointment).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Schedule anyway' }));
    });

    expect(onSelectAppointment).toHaveBeenCalledTimes(1);
    const [appointment, options] = onSelectAppointment.mock.calls[0] as [Appointment, { available: boolean }];
    expect(options).toStrictEqual({ available: false });
    expect(appointment.status).toBe('proposed');
    expect(appointment.start).toBe('2026-07-27T13:15:00.000Z');
    expect(appointment.end).toBe('2026-07-27T13:45:00.000Z');
    expect(appointment.participant?.[0].actor?.reference).toBe('Practitioner/dr-rivera');
    expect(appointment.contained).toHaveLength(1);
  });

  test('Backing out of the warning changes nothing', async () => {
    const onSelectAppointment = vi.fn();
    setup({ onSelectAppointment });

    await enterTime('09:15');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });

    expect(screen.queryByText('That time is not available')).not.toBeInTheDocument();
    expect(onSelectAppointment).not.toHaveBeenCalled();
  });

  test('Editing the time withdraws the warning about the old one', async () => {
    setup({});

    await enterTime('09:15');
    expect(screen.getByText('That time is not available')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Time' }), { target: { value: '09:45' } });
    });

    expect(screen.queryByText('That time is not available')).not.toBeInTheDocument();
  });

  test('Says so when the time makes no sense', async () => {
    const onSelectAppointment = vi.fn();
    setup({ onSelectAppointment });

    await enterTime('noon');

    expect(screen.getByText('Enter a time as HH:MM')).toBeInTheDocument();
    expect(screen.queryByText('That time is not available')).not.toBeInTheDocument();
    expect(onSelectAppointment).not.toHaveBeenCalled();
  });

  test('Asks who the time is with when the search covered several', async () => {
    const onSelectAppointment = vi.fn();
    setup({ options: [RIVERA, OKAFOR], onSelectAppointment });

    act(() => {
      fireEvent.click(screen.getByRole('textbox', { name: 'With' }));
    });
    const okafor = await screen.findByText('Dr. Tunde Okafor');
    await act(async () => {
      fireEvent.click(okafor);
    });

    await enterTime('09:15');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Schedule anyway' }));
    });

    const [appointment] = onSelectAppointment.mock.calls[0] as [Appointment];
    expect(appointment.participant?.[0].actor?.reference).toBe('Practitioner/dr-okafor');
    expect(appointment.contained?.[0]).toMatchObject({ schedule: { reference: 'Schedule/schedule-dr-okafor' } });
  });

  test('Does not ask who a single-actor search is with', () => {
    setup({});
    expect(screen.queryByRole('textbox', { name: 'With' })).not.toBeInTheDocument();
  });

  test('Renders nothing when there is nobody to hold the time on', () => {
    setup({ options: [] });
    expect(screen.queryByTestId('custom-time-card')).not.toBeInTheDocument();
  });

  test('Cannot submit an empty time', () => {
    setup({});
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Use this time' }).disabled).toBe(true);
  });
});

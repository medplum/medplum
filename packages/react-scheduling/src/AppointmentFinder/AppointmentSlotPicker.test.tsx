// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Appointment } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { SchedulingFixtures, buildProposedAppointment } from '../stories/scheduling';
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { ActorCombination } from './AppointmentFinder.schedules';
import { getActorsKey } from './AppointmentFinder.times';
import type { AppointmentSlotPickerProps, CustomTimeConfig } from './AppointmentSlotPicker';
import { AppointmentSlotPicker } from './AppointmentSlotPicker';

const EASTERN = 'America/New_York';
const medplum = new MockClient();

const RIVERA: ActorCombination = {
  key: getActorsKey([{ reference: 'Practitioner/dr-rivera' }]),
  label: 'Dr. Maya Rivera',
  actors: [{ reference: 'Practitioner/dr-rivera', display: 'Dr. Maya Rivera' }],
  schedules: [{ reference: 'Schedule/schedule-dr-rivera' }],
};

const CUSTOM_TIME: CustomTimeConfig = { options: [RIVERA], durationMinutes: 30 };

function setup(props: Partial<AppointmentSlotPickerProps>): void {
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );
  render(
    <AppointmentSlotPicker appointments={[]} timezone={EASTERN} onSelectAppointment={vi.fn()} {...props} />,
    wrapper
  );
}

describe('AppointmentSlotPicker', () => {
  beforeAll(async () => {
    for (const resource of SchedulingFixtures) {
      await medplum.createResource(resource);
    }
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  test('Opens on the first day with times, and only that day', async () => {
    setup({
      appointments: [
        buildProposedAppointment({ start: '2026-07-27T16:30:00.000Z' }),
        // A week later, with nothing in between: the days with no times are
        // passed over rather than shown empty.
        buildProposedAppointment({ start: '2026-08-04T19:15:00.000Z' }),
      ],
    });

    expect(await screen.findByText('Monday, July 27')).toBeInTheDocument();
    // One day at a time, so the next waits to be asked for.
    expect(screen.queryByText('Tuesday, August 4')).not.toBeInTheDocument();

    // 16:30 UTC is 12:30 in Eastern time, which is what the clinic offers. The
    // browser here is on Pacific time, so an unzoned format would say 9:30 AM.
    expect(screen.getByRole('button', { name: '12:30 PM' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '3:15 PM' })).not.toBeInTheDocument();
  });

  test('Leaves walking through the days to whatever picks them', async () => {
    setup({
      appointments: [
        buildProposedAppointment({ start: '2026-07-27T16:30:00.000Z' }),
        buildProposedAppointment({ start: '2026-07-30T16:30:00.000Z' }),
      ],
    });

    await screen.findByText('Monday, July 27');

    // Which day is being read is a question for the calendar beside these times,
    // so there is nothing here for stepping through them.
    expect(screen.queryByText('Thursday, July 30')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more dates/i })).not.toBeInTheDocument();
  });

  test('Shows as many days at a time as the caller asks for', async () => {
    const appointments = [
      buildProposedAppointment({ start: '2026-07-27T16:30:00.000Z' }),
      buildProposedAppointment({ start: '2026-07-28T19:15:00.000Z' }),
      buildProposedAppointment({ start: '2026-07-29T19:15:00.000Z' }),
    ];

    setup({ appointments, daysShown: 2 });

    expect(await screen.findByText('Monday, July 27')).toBeInTheDocument();
    expect(screen.getByText('Tuesday, July 28')).toBeInTheDocument();
    expect(screen.queryByText('Wednesday, July 29')).not.toBeInTheDocument();
  });

  test('Reports the chosen appointment unchanged, with its contained Slots', async () => {
    const appointment = buildProposedAppointment({ start: '2026-07-27T16:30:00.000Z' });
    const onSelectAppointment = vi.fn();
    setup({ appointments: [appointment], onSelectAppointment });

    const time = await screen.findByRole('button', { name: '12:30 PM' });
    await act(async () => {
      fireEvent.click(time);
    });

    expect(onSelectAppointment).toHaveBeenCalledWith(appointment, { available: true });
    const selected = onSelectAppointment.mock.calls[0][0] as Appointment;
    expect(selected.contained).toHaveLength(1);
    expect(selected.status).toBe('proposed');
  });

  test('Keeps asking for a particular time out of the way until it is asked for', async () => {
    setup({
      appointments: [buildProposedAppointment({ start: '2026-07-27T16:30:00.000Z' })],
      customTime: CUSTOM_TIME,
    });

    await screen.findByText('Monday, July 27');
    expect(screen.queryByTestId('custom-time-card')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ask for a specific time' }));
    });

    expect(screen.getByTestId('custom-time-card')).toBeInTheDocument();
    expect(screen.getByText('Ask for a time on Monday, July 27 that is not offered above.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask for a specific time' })).not.toBeInTheDocument();
  });

  test('A search that found nothing has only a request to offer, so it asks straight away', async () => {
    setup({
      appointments: [],
      customTime: CUSTOM_TIME,
      customTimeDay: new Date(2026, 6, 26),
    });

    // No link to click first: there is nothing else left to do with the day.
    expect(await screen.findByTestId('custom-time-card')).toBeInTheDocument();
    expect(screen.getByText(/No available times match this search/)).toBeInTheDocument();
    expect(screen.getByText('Ask for a time on Sunday, July 26 that is not offered above.')).toBeInTheDocument();
  });

  test('Takes a time on a day that offered none', async () => {
    const onSelectAppointment = vi.fn();
    setup({
      appointments: [],
      customTime: CUSTOM_TIME,
      customTimeDay: new Date(2026, 6, 27),
      onSelectAppointment,
    });

    expect(await screen.findByText(/Ask for a specific time below/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Time' }), { target: { value: '11:00' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use this time' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Schedule anyway' }));
    });

    const [appointment, options] = onSelectAppointment.mock.calls[0] as [Appointment, { available: boolean }];
    expect(options).toStrictEqual({ available: false });
    // 11:00 on the clinic's Eastern clock, on the day that was picked.
    expect(appointment.start).toBe('2026-07-27T15:00:00.000Z');
  });

  test('Recognises an offered time on a day named with a time of day', async () => {
    // Offered by the same actor the request would be held on, since a time is only
    // the offer it looks like when it is with the same people.
    const offered = buildProposedAppointment({
      start: '2026-07-27T16:30:00.000Z',
      actorReferences: ['Practitioner/dr-rivera'],
      scheduleReferences: ['Schedule/schedule-dr-rivera'],
    });
    const onSelectAppointment = vi.fn();
    setup({
      appointments: [offered],
      customTime: CUSTOM_TIME,
      // A caller opening the finder on a range of its own names the day by an
      // instant rather than by midnight, which is still the same calendar day.
      customTimeDay: new Date(2026, 6, 27, 9, 30),
      onSelectAppointment,
    });

    const askForTime = await screen.findByRole('button', { name: 'Ask for a specific time' });
    await act(async () => {
      fireEvent.click(askForTime);
    });
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Time' }), { target: { value: '12:30' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use this time' }));
    });

    // The time asked for is one on offer, so it is taken as that offer — Slots and
    // all — rather than warned about and rebuilt as a time nobody checked.
    expect(screen.queryByText('That time is not available')).not.toBeInTheDocument();
    expect(onSelectAppointment).toHaveBeenCalledWith(offered, { available: true });
  });

  test('Does not invite a request for a time it has no day to put it on', async () => {
    // Nothing found and no day named, so there is nothing to ask about. Pointing
    // at a card that cannot render would send the user looking for it.
    setup({ appointments: [], customTime: CUSTOM_TIME });

    expect(await screen.findByText(/No available times match this search/)).toBeInTheDocument();
    expect(screen.queryByTestId('custom-time-card')).not.toBeInTheDocument();
    expect(screen.queryByText(/Ask for a specific time below/)).not.toBeInTheDocument();
  });

  test('Offers no way to ask for a time unless the caller allows it', async () => {
    setup({ appointments: [buildProposedAppointment({ start: '2026-07-27T16:30:00.000Z' })] });

    await screen.findByText('Monday, July 27');
    expect(screen.queryByTestId('custom-time-card')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask for a specific time' })).not.toBeInTheDocument();
  });

  test('Closes a request for a specific time once a different search is on screen', async () => {
    const first = [buildProposedAppointment({ start: '2026-07-27T16:30:00.000Z' })];
    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
    );
    const props = { timezone: EASTERN, customTime: CUSTOM_TIME, onSelectAppointment: vi.fn() };
    const { rerender } = render(<AppointmentSlotPicker appointments={first} searchKey="rivera" {...props} />, wrapper);

    await screen.findByText('Monday, July 27');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ask for a specific time' }));
    });
    expect(screen.getByTestId('custom-time-card')).toBeInTheDocument();

    // More times for the same search leave the request where it is.
    rerender(
      <AppointmentSlotPicker
        appointments={[...first, buildProposedAppointment({ start: '2026-07-27T18:00:00.000Z' })]}
        searchKey="rivera"
        {...props}
      />
    );

    expect(screen.getByTestId('custom-time-card')).toBeInTheDocument();

    // A different search is a different question, and the request belonged to the
    // one it was opened from.
    rerender(<AppointmentSlotPicker appointments={first} searchKey="okafor" {...props} />);

    expect(screen.queryByTestId('custom-time-card')).not.toBeInTheDocument();
  });

  test('Groups a day into one card per set of actors', async () => {
    setup({
      appointments: [
        buildProposedAppointment({ start: '2026-07-27T16:30:00.000Z', actorReferences: ['Device/ultrasound-1'] }),
        buildProposedAppointment({ start: '2026-07-27T17:00:00.000Z', actorReferences: ['Device/ultrasound-1'] }),
        buildProposedAppointment({ start: '2026-07-27T16:30:00.000Z', actorReferences: ['Practitioner/dr-rivera'] }),
      ],
    });

    await screen.findByText('Monday, July 27');
    expect(screen.getByTestId('slot-group-Device/ultrasound-1')).toBeInTheDocument();
    expect(screen.getByTestId('slot-group-Practitioner/dr-rivera')).toBeInTheDocument();
    expect(screen.getAllByText('30 min visit')).toHaveLength(2);
  });

  test('Says so when nothing is available', async () => {
    setup({ appointments: [] });
    expect(await screen.findByText(/No available times match this search/)).toBeInTheDocument();
  });

  test('Withholds results while searching rather than flashing an empty state', () => {
    setup({ appointments: [buildProposedAppointment({ start: '2026-07-27T16:30:00.000Z' })], loading: true });
    expect(screen.queryByText(/No available times/)).not.toBeInTheDocument();
    expect(screen.queryByText('Monday, July 27')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '12:30 PM' })).not.toBeInTheDocument();
  });

  test('Shows why a search failed', async () => {
    setup({ appointments: [], error: new Error('Search range cannot exceed 31 days') });
    expect(await screen.findByText('Search range cannot exceed 31 days')).toBeInTheDocument();
  });
});

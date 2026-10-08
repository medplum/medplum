// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Bundle, Slot } from '@medplum/fhirtypes';
import type { MockClient } from '@medplum/mock';
import type { JSX } from 'react';
import { useEffect } from 'react';
import { installFindStub } from '../stories/mockFind';
import { installAutocompleteTimers } from '../test-utils/asyncAutocomplete';
import { chooseActor, chooseImagingService, MONDAY_MORNING, setupBookingClient } from '../test-utils/bookingForm';
import { act, fireEvent, renderWithMedplum, screen, within } from '../test-utils/render';
import { SchedulingWorkspace } from './SchedulingWorkspace';

installAutocompleteTimers();

/** What the stubbed calendar reports being dragged out: noon to one on the Tuesday. */
const TUESDAY_NOON = { start: new Date(2026, 7, 18, 12, 0), end: new Date(2026, 7, 18, 13, 0) };

const CALENDAR_WEEK = { start: new Date(2026, 7, 16), end: new Date(2026, 7, 22, 23, 59, 59) };

/*
 * FullCalendar needs real layout to select against, which jsdom has none of. As in
 * SchedulingWorkspace.booking.test.tsx, the calendar is stood up as a button reporting
 * a drag, plus a line per Slot it was handed and a readout of what it highlights.
 */
vi.mock('../MultiCalendar/MultiCalendar', () => ({
  MultiCalendar: (props: {
    sources?: { slots: Slot[] }[];
    onSelectInterval?: (interval: { start: Date; end: Date }) => void;
    onRangeChange?: (range: { start: Date; end: Date }) => void;
    selection?: { start: Date; end: Date };
  }): JSX.Element => {
    const { onRangeChange } = props;
    useEffect(() => onRangeChange?.(CALENDAR_WEEK), [onRangeChange]);

    return (
      <div>
        <button
          type="button"
          onClick={() =>
            props.onSelectInterval?.({ start: new Date(TUESDAY_NOON.start), end: new Date(TUESDAY_NOON.end) })
          }
        >
          drag tuesday noon
        </button>
        {(props.sources ?? [])
          .flatMap((source) => source.slots)
          .map((slot) => (
            <div key={slot.id}>
              slot {slot.schedule.reference} {slot.status}
            </div>
          ))}
        <div data-testid="marked-time">
          {props.selection ? `${props.selection.start.toISOString()}/${props.selection.end.toISOString()}` : 'none'}
        </div>
      </div>
    );
  },
}));

async function dragCalendar(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'drag tuesday noon' }));
  });
}

async function chooseTab(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('tab', { name }));
  });
}

function pane(): HTMLElement | null {
  return screen.queryByRole('region', { name: 'Book appointment' });
}

function markedTime(): string {
  return screen.getByTestId('marked-time').textContent ?? '';
}

describe('SchedulingWorkspace blocking', () => {
  let medplum: MockClient;
  let restoreFind: () => void;

  beforeEach(async () => {
    vi.setSystemTime(MONDAY_MORNING);
    medplum = await setupBookingClient();
    restoreFind = installFindStub(medplum);
    vi.spyOn(medplum, 'executeBatch');
  });

  afterEach(() => {
    restoreFind();
  });

  test('Blocks the time dragged out on only the calendar named, and draws it', async () => {
    const onBlocked = vi.fn();
    renderWithMedplum(<SchedulingWorkspace onBlocked={onBlocked} />, medplum);

    await dragCalendar();
    await chooseTab('Block');
    expect(within(pane() as HTMLElement).getByRole('heading', { name: 'Block time' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Start/)).toHaveValue('2026-08-18T12:00');
    expect(screen.getByLabelText(/^End/)).toHaveValue('2026-08-18T13:00');

    await chooseActor(/Provider/, 'riv', 'Dr. Maya Rivera');
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^Comment/), { target: { value: 'Lunch' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Block time' }));
    });

    const bundle = vi.mocked(medplum.executeBatch).mock.calls[0][0] as Bundle<Slot>;
    expect(bundle.entry?.map((entry) => entry.resource)).toStrictEqual([
      expect.objectContaining({
        schedule: { reference: 'Schedule/schedule-dr-rivera' },
        status: 'busy',
        comment: 'Lunch',
      }),
    ]);
    const [slot] = onBlocked.mock.calls[0][0] as WithId<Slot>[];
    expect(slot.schedule.reference).toBe('Schedule/schedule-dr-rivera');

    // The pane is done with, and the block is on the calendar without a reload.
    expect(pane()).not.toBeInTheDocument();
    expect(markedTime()).toBe('none');
    expect(screen.getByText('slot Schedule/schedule-dr-rivera busy')).toBeInTheDocument();
  });

  test('Keeps each tab’s answers and its own highlight across a switch, and the tab across clicks', async () => {
    renderWithMedplum(<SchedulingWorkspace />, medplum);
    await dragCalendar();
    await chooseImagingService();

    await chooseTab('Block');
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^End/), { target: { value: '2026-08-18T15:00' } });
    });
    expect(markedTime()).toBe(`${TUESDAY_NOON.start.toISOString()}/${new Date(2026, 7, 18, 15).toISOString()}`);

    // The booking form's highlight is still the time clicked, and its visit type survives.
    await chooseTab('Appointment');
    expect(markedTime()).toBe(`${TUESDAY_NOON.start.toISOString()}/${TUESDAY_NOON.end.toISOString()}`);
    expect(within(pane() as HTMLElement).getByText('Ultrasound Imaging')).toBeInTheDocument();

    // A new click puts the block's times back to the time clicked, keeping the calendars
    // named, and stays on the Block tab.
    await chooseTab('Block');
    await chooseActor(/Provider/, 'riv', 'Dr. Maya Rivera');
    await dragCalendar();
    expect(screen.getByRole('tab', { name: 'Block' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText(/^End/)).toHaveValue('2026-08-18T13:00');
    expect(markedTime()).toBe(`${TUESDAY_NOON.start.toISOString()}/${TUESDAY_NOON.end.toISOString()}`);
    expect(screen.getByRole('button', { name: 'Block time' })).toBeEnabled();
  });
});

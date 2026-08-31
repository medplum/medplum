// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Appointment } from '@medplum/fhirtypes';
import type { MockClient } from '@medplum/mock';
import type { JSX } from 'react';
import type { MockInstance } from 'vitest';
import type { AppointmentBooking } from '../AppointmentFinder/AppointmentBookingForm';
import { installBookStub } from '../stories/mockBook';
import { installFindStub } from '../stories/mockFind';
import { ElderJordanPatient } from '../stories/scheduling';
import { installAutocompleteTimers } from '../test-utils/asyncAutocomplete';
import {
  chooseActor,
  chooseDay,
  chooseImagingService,
  choosePatient,
  chooseSecondOfferedTime,
  clickBook,
  fillBooking,
  hasPill,
  lastFindStart,
  MONDAY_MORNING,
  openTimeFinder,
  patientDetail,
  setupBookingClient,
} from '../test-utils/bookingForm';
import { act, fireEvent, renderWithMedplum, screen } from '../test-utils/render';
import { SchedulingWorkspace } from './SchedulingWorkspace';

// A separate file from SchedulingWorkspace.test.tsx, whose own fixtures block installs
// sinon's fake timers: these tests drive autocompletes, which need vitest's.
installAutocompleteTimers();

// What the stubbed calendar reports being clicked on. All after MONDAY_MORNING, which
// matters: `$find` treats the day as a floor and clamps a past one to now, so two past
// days would be indistinguishable. Two instants on the Tuesday, because a second click
// within the day already open has to be told from a click on a different day.
const TUESDAY_MORNING = new Date(2026, 7, 18, 9, 0, 0);
const TUESDAY_AFTERNOON = new Date(2026, 7, 18, 14, 0, 0);
const THURSDAY_MORNING = new Date(2026, 7, 20, 9, 0, 0);

const CLICK_TARGETS = {
  'tuesday morning': TUESDAY_MORNING,
  'tuesday afternoon': TUESDAY_AFTERNOON,
  thursday: THURSDAY_MORNING,
};

type ClickTarget = keyof typeof CLICK_TARGETS;

/*
 * FullCalendar's selection is pointer-driven and needs real layout to hit-test against,
 * which jsdom has none of. So the calendar is stood up as two buttons that report a click
 * on a known day, leaving the real grid's own behaviour to Storybook. Everything under
 * test here — what opens the pane, what it pre-fills, what closes it — belongs to the
 * workspace either way.
 */
vi.mock('../MultiCalendar/MultiCalendar', () => ({
  MultiCalendar: (props: {
    onSelectInterval?: (interval: { start: Date; end: Date }) => void;
    selection?: { start: Date; end: Date };
  }): JSX.Element => (
    <div>
      {Object.entries(CLICK_TARGETS).map(([name, target]) => (
        <button
          key={name}
          type="button"
          // A new Date per click, as the real calendar reports them: handing back one
          // instance would make every same-day click look identical by reference and
          // hide whether the day is actually being compared.
          onClick={() => props.onSelectInterval?.({ start: new Date(target), end: new Date(target) })}
        >
          click {name}
        </button>
      ))}
      {/* Stands in for the highlight the real grid draws over the interval it is given. */}
      <div data-testid="marked-time">{props.selection ? props.selection.start.toISOString() : 'none'}</div>
    </div>
  ),
}));

/**
 * Clicks open time on the calendar, the way a user opens the booking form.
 * @param target - Which of the stubbed instants to report a click on.
 */
async function clickCalendar(target: ClickTarget = 'tuesday morning'): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: `click ${target}` }));
  });
}

function bookingPaneHeading(): HTMLElement | null {
  return screen.queryByRole('heading', { name: /book appointment/i });
}

/**
 * The proposal that was booked, as `$book` was asked for it.
 * @param post - A spy on the client's `post`.
 * @returns The appointment inside the `$book` request.
 */
function bookedProposal(post: MockInstance<MockClient['post']>): Appointment {
  const call = post.mock.calls.find(([url]) => String(url).includes('Appointment/$book'));
  const parameters = call?.[1] as { parameter: { resource: Appointment }[] };
  return parameters.parameter[0].resource;
}

/**
 * What the calendar is marking.
 * @returns The marked instant, or 'none' while the calendar is marking nothing.
 */
function markedTime(): string {
  return screen.getByTestId('marked-time').textContent ?? '';
}

describe('SchedulingWorkspace booking', () => {
  let medplum: MockClient;
  let restoreFind: () => void;
  let restoreBook: () => void;

  beforeEach(async () => {
    vi.setSystemTime(MONDAY_MORNING);
    medplum = await setupBookingClient();
    restoreFind = installFindStub(medplum);
    restoreBook = installBookStub(medplum);
  });

  afterEach(() => {
    restoreBook();
    restoreFind();
  });

  function setup(onBooked?: (booking: AppointmentBooking) => void): void {
    renderWithMedplum(<SchedulingWorkspace onBooked={onBooked} />, medplum);
  }

  test('Offers no booking form until the calendar is clicked', () => {
    setup();

    expect(bookingPaneHeading()).not.toBeInTheDocument();
  });

  test('Opens the booking form when the calendar is clicked', async () => {
    setup();
    await clickCalendar();

    expect(bookingPaneHeading()).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /visit type/i })).toBeInTheDocument();
  });

  test('Opens the time search on the day clicked rather than today', async () => {
    const get = vi.spyOn(medplum, 'get');
    setup();
    await clickCalendar();

    await chooseImagingService();
    await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
    await openTimeFinder();

    // Read off the request rather than the day headings on screen: the pane writes the
    // day it was opened on in the same words the search writes its own, so an assertion
    // on the text would pass whether the search opened there or never opened at all.
    const start = lastFindStart(get);
    expect(start).toBeDefined();
    expect(new Date(start as string).getDate()).toBe(TUESDAY_MORNING.getDate());
  });

  test('Books the appointment and closes the form', async () => {
    const post = vi.spyOn(medplum, 'post');
    setup();
    await clickCalendar();

    await fillBooking();
    await clickBook();

    expect(post.mock.calls.some(([url]) => String(url).includes('Appointment/$book'))).toBe(true);
    // The calendar refreshes itself from the booking's own announcement, so there is
    // nothing left for the pane to show.
    expect(bookingPaneHeading()).not.toBeInTheDocument();
  });

  test('Reports the booking it wrote to the host', async () => {
    const onBooked = vi.fn();
    setup(onBooked);
    await clickCalendar();

    await fillBooking();
    await clickBook();

    // The pane closes on success, and the appointment does not always turn up on the
    // calendar to speak for itself — it may fall outside the visible range, or onto a
    // schedule that is deselected. So the host is told what was booked, and announces
    // it however it announces things.
    expect(onBooked).toHaveBeenCalledTimes(1);
    const booking = onBooked.mock.calls[0][0] as AppointmentBooking;
    expect(booking.appointment.participant).toContainEqual(
      expect.objectContaining({ actor: expect.objectContaining({ display: 'Jordan Reyes' }) })
    );
  });

  test('Closes the form when dismissed', async () => {
    setup();
    await clickCalendar();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /close booking form/i }));
    });

    expect(bookingPaneHeading()).not.toBeInTheDocument();
    expect(markedTime()).toBe('none');
  });

  test('Re-opens on a different day, clearing what was answered for the old one', async () => {
    setup();
    await clickCalendar('tuesday morning');
    await chooseImagingService();
    expect(hasPill('Ultrasound Imaging')).toBe(true);

    await clickCalendar('thursday');

    // A different day is a different visit, and the answers were for the old one.
    expect(hasPill('Ultrasound Imaging')).toBe(false);
  });

  test('Keeps what was answered when the same day is clicked again', async () => {
    setup();
    await clickCalendar('tuesday morning');
    await chooseImagingService();

    await clickCalendar('tuesday afternoon');

    // Clicking around inside the day being booked is not a change of mind about which
    // day it is, and must not take the answers away.
    expect(hasPill('Ultrasound Imaging')).toBe(true);
  });

  describe('Marking the time being booked', () => {
    test('Marks the time that was clicked', async () => {
      setup();
      expect(markedTime()).toBe('none');

      await clickCalendar('tuesday morning');

      expect(markedTime()).toBe(TUESDAY_MORNING.toISOString());
    });

    test('Moves the mark to the time chosen in the form', async () => {
      const post = vi.spyOn(medplum, 'post');
      setup();
      await clickCalendar('tuesday morning');

      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      // The second time on offer, because the first is the very time that was
      // clicked: a mark that never moved would pass for one that followed.
      await chooseSecondOfferedTime();
      const marked = markedTime();

      await choosePatient('Jordan', patientDetail(ElderJordanPatient, 'MRN-0041'));
      await clickBook();

      // Marked to the instant that got booked, not merely somewhere else.
      expect(marked).toBe(new Date(bookedProposal(post).start as string).toISOString());
    });

    test('Takes the mark down when the form drops the time', async () => {
      setup();
      await clickCalendar('tuesday morning');

      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await chooseSecondOfferedTime();
      expect(markedTime()).not.toBe('none');

      // Searching another day drops the time, and a mark left on the old one would
      // be pointing at a time nobody has chosen.
      await chooseDay('19');

      expect(markedTime()).toBe('none');
    });
  });
});

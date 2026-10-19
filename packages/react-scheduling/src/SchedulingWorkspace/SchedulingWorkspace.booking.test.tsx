// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getExtensionValue, SchedulingMedicalNecessityURI, toServiceTypeCodeableConcepts } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import type { MockClient } from '@medplum/mock';
import type { JSX } from 'react';
import { useEffect } from 'react';
import type { MockInstance } from 'vitest';
import type { AppointmentBooking } from '../AppointmentFinder/AppointmentBookingForm';
import { installBookStub } from '../stories/mockBook';
import { installFindStub } from '../stories/mockFind';
import { installValueSetStub } from '../stories/mockValueSet';
import {
  AuthorizationValueSets,
  DIAGNOSIS_VALUE_SET,
  DiagnosisCodes,
  ElderJordanPatient,
  InfusionService,
  MilesCooperPatient,
  PROCEDURE_VALUE_SET,
  ProcedureCodes,
  RiveraImagingAppointment,
  RiveraImagingHeldSlots,
  SatelliteClinic,
} from '../stories/scheduling';
import { installAutocompleteTimers, removePill, settleAutocomplete } from '../test-utils/asyncAutocomplete';
import {
  addRow,
  chooseActor,
  chooseDay,
  chooseImagingService,
  choosePatient,
  chooseRepeat,
  chooseSecondOfferedTime,
  chosenTimeField,
  clickBook,
  codePill,
  dragDays,
  enterAuthorizationDetails,
  enterCode,
  field,
  fillAuthorizedBooking,
  fillBooking,
  hasPill,
  lastFindParams,
  lastFindStart,
  MONDAY_MORNING,
  openTimeFinder,
  patientDetail,
  setupBookingClient,
} from '../test-utils/bookingForm';
import { act, fireEvent, renderWithMedplum, screen, within } from '../test-utils/render';
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

/** The week the stubbed grid stands for, which is the week every click below lands in. */
const CALENDAR_WEEK = { start: new Date(2026, 7, 16), end: new Date(2026, 7, 22, 23, 59, 59) };

/** A visit already on Dr. Rivera's calendar that week, for the grid to offer a click on. */
const BOOKED_VISIT: WithId<Appointment> = {
  resourceType: 'Appointment',
  id: 'appt-rivera-tue',
  status: 'booked',
  start: new Date(2026, 7, 18, 11, 0, 0).toISOString(),
  end: new Date(2026, 7, 18, 11, 30, 0).toISOString(),
  serviceType: [{ text: 'Ultrasound Imaging' }],
  participant: [
    { status: 'accepted', actor: { reference: 'Patient/pt-cooper', display: 'Miles Cooper' } },
    { status: 'accepted', actor: { reference: 'Practitioner/dr-rivera', display: 'Dr. Maya Rivera' } },
  ],
};

/** {@link BOOKED_VISIT}, booked for a visit type asking for codes, with them given. */
const AUTHORIZED_VISIT: WithId<Appointment> = {
  ...BOOKED_VISIT,
  id: 'appt-rivera-infusion-tue',
  serviceType: [...toServiceTypeCodeableConcepts(InfusionService), { coding: [ProcedureCodes[0]] }],
  reasonCode: [{ coding: [DiagnosisCodes[0]] }],
  extension: [{ url: SchedulingMedicalNecessityURI, valueBoolean: true }],
};

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
    sources?: { appointments: Appointment[]; interactive?: boolean; draft?: boolean; label?: string }[];
    onSelectInterval?: (interval: { start: Date; end: Date }) => void;
    onSelectAppointment?: (appointment: Appointment) => void;
    onRangeChange?: (range: { start: Date; end: Date }) => void;
    selection?: { start: Date; end: Date };
  }): JSX.Element => {
    // The real grid announces the week it opened on, and nothing is loaded onto the
    // calendar until it does. Announced once, as a grid that is never paged announces it.
    const { onRangeChange } = props;
    useEffect(() => onRangeChange?.(CALENDAR_WEEK), [onRangeChange]);

    return (
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
        {(props.sources ?? [])
          .filter((source) => source.interactive !== false)
          .flatMap((source) => source.appointments)
          .map((appointment) => (
            <button key={appointment.id} type="button" onClick={() => props.onSelectAppointment?.(appointment)}>
              click appointment {appointment.id}
            </button>
          ))}
        {/* Stands in for the highlight the real grid draws over the interval it is given. */}
        <div data-testid="marked-time">{props.selection ? props.selection.start.toISOString() : 'none'}</div>
        {/* Stands in for the events the real grid draws for appointments not yet booked. */}
        <div
          data-testid="proposed-time"
          data-label={(props.sources ?? [])
            .filter((source) => source.draft)
            .map((source) => source.label)
            .join(',')}
        >
          {(props.sources ?? [])
            .filter((source) => source.draft)
            .flatMap((source) => source.appointments)
            .map((appointment) => new Date(appointment.start as string).toISOString())
            .join(',') || 'none'}
        </div>
      </div>
    );
  },
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
 * The details of the appointment that is open, as far as any is.
 * @returns The pane they are shown in, or null while none is open.
 */
function detailsPane(): HTMLElement | null {
  return screen.queryByRole('region', { name: 'Appointment details' });
}

/** Clicks the booked visit on the calendar, the way a user opens its details. */
async function clickBookedVisit(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: `click appointment ${BOOKED_VISIT.id}` }));
  });
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

/**
 * What the calendar draws as not yet booked.
 * @returns The proposed appointments' starts, or 'none' while there are none.
 */
function proposedTime(): string {
  return screen.getByTestId('proposed-time').textContent ?? '';
}

describe('SchedulingWorkspace booking', () => {
  let medplum: MockClient;
  let restoreFind: () => void;
  let restoreBook: () => void;
  let restoreValueSets: () => void;

  beforeEach(async () => {
    vi.setSystemTime(MONDAY_MORNING);
    medplum = await setupBookingClient();
    restoreFind = installFindStub(medplum);
    restoreBook = installBookStub(medplum);
    restoreValueSets = installValueSetStub(medplum, AuthorizationValueSets);
  });

  afterEach(() => {
    restoreValueSets();
    restoreBook();
    restoreFind();
  });

  function setup(
    onBooked?: (booking: AppointmentBooking) => void,
    onUpdated?: (appointment: WithId<Appointment>) => void
  ): void {
    renderWithMedplum(
      <SchedulingWorkspace
        procedureBinding={PROCEDURE_VALUE_SET}
        diagnosisBinding={DIAGNOSIS_VALUE_SET}
        onBooked={onBooked}
        onUpdated={onUpdated}
      />,
      medplum
    );
  }

  test.each([false, true])(
    'forwards manual rescheduling permission through appointment details (%s)',
    async (canBypassSchedulingRules) => {
      for (const slot of RiveraImagingHeldSlots) {
        await medplum.updateResource(slot);
      }
      const appointment = await medplum.updateResource({
        ...RiveraImagingAppointment,
        start: BOOKED_VISIT.start,
        end: BOOKED_VISIT.end,
      });
      renderWithMedplum(<SchedulingWorkspace canBypassSchedulingRules={canBypassSchedulingRules} />, medplum);
      await settleAutocomplete();
      // The visit is on several calendars, so the stand-in grid draws it once per calendar.
      fireEvent.click(screen.getAllByRole('button', { name: `click appointment ${appointment.id}` })[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
      await settleAutocomplete();
      await openTimeFinder();
      expect(screen.queryByText('Or enter a time') !== null).toBe(canBypassSchedulingRules);
    }
  );

  test('Offers no booking form until the calendar is clicked', () => {
    setup();

    expect(bookingPaneHeading()).not.toBeInTheDocument();
  });

  test('Opens the booking form when the calendar is clicked', async () => {
    setup();
    await clickCalendar();

    expect(bookingPaneHeading()).toBeInTheDocument();
    // Scoped to the pane, since the sidebar filter wears the same label.
    expect(field(/visit type/i)).toBeInTheDocument();
  });

  test('Starts on the site the workspace was opened on', async () => {
    renderWithMedplum(<SchedulingWorkspace defaultLocation={SatelliteClinic} />, medplum);
    await clickCalendar();

    const pane = screen.getByRole('region', { name: 'Book appointment' });
    expect(within(pane).getByText('Uro Associates - Satellite')).toBeInTheDocument();
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

  test('Searches for a weekly series of the length asked for', async () => {
    const get = vi.spyOn(medplum, 'get');
    setup();
    await clickCalendar();

    await chooseImagingService();
    await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
    await openTimeFinder();
    expect(lastFindParams(get)?.has('occurrence-count')).toBe(false);

    await chooseRepeat('Once a week for 3 weeks');
    expect(lastFindParams(get)?.get('occurrence-count')).toBe('3');
  });

  test('Searches at most a week of days for a weekly series', async () => {
    const get = vi.spyOn(medplum, 'get');
    setup();
    await clickCalendar();

    await chooseImagingService();
    await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
    await openTimeFinder();
    await dragDays('18', '27');
    await chooseRepeat('Once a week for 3 weeks');

    expect(screen.getByText('Choose at most 7 days at a time for a recurring appointment.')).toBeInTheDocument();
    expect(lastFindParams(get)?.has('occurrence-count')).toBe(false);
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
    expect(booking.appointments[0].participant).toContainEqual(
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

  test('Keeps what was answered, and searches the new day, when a different day is clicked', async () => {
    const get = vi.spyOn(medplum, 'get');
    setup();
    await clickCalendar('tuesday morning');
    await chooseImagingService();
    await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
    await openTimeFinder();

    await clickCalendar('thursday');

    expect(hasPill('Ultrasound Imaging')).toBe(true);
    expect(new Date(lastFindStart(get) as string).getDate()).toBe(THURSDAY_MORNING.getDate());
  });

  test('Keeps the time chosen when the day already searched is clicked again', async () => {
    setup();
    await clickCalendar('tuesday morning');
    await chooseImagingService();
    await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
    await openTimeFinder();
    await chooseSecondOfferedTime();

    await clickCalendar('tuesday afternoon');

    expect(hasPill('Ultrasound Imaging')).toBe(true);
    expect(chosenTimeField()).toBeInTheDocument();
  });

  describe('Marking the time being booked', () => {
    test('Marks the time that was clicked', async () => {
      setup();
      expect(markedTime()).toBe('none');

      await clickCalendar('tuesday morning');

      expect(markedTime()).toBe(TUESDAY_MORNING.toISOString());
    });

    test('Draws the time chosen in the form as a proposal, leaving the mark on the click', async () => {
      const post = vi.spyOn(medplum, 'post');
      setup();
      await clickCalendar('tuesday morning');
      expect(proposedTime()).toBe('none');

      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      // The second time on offer, because the first is the very time that was clicked.
      await chooseSecondOfferedTime();
      const proposed = proposedTime();
      expect(markedTime()).toBe(TUESDAY_MORNING.toISOString());

      await choosePatient('Jordan', patientDetail(ElderJordanPatient, 'MRN-0041'));
      await clickBook();

      // Drawn at the instant that got booked, not merely somewhere else.
      expect(proposed).toBe(new Date(bookedProposal(post).start as string).toISOString());
      expect(proposedTime()).toBe('none');
    });

    test('Takes the proposal down when the form drops the time', async () => {
      setup();
      await clickCalendar('tuesday morning');
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await chooseSecondOfferedTime();
      expect(proposedTime()).not.toBe('none');

      // Searching another day drops the time, and a proposal left on the old one would
      // be pointing at a time nobody has chosen.
      await chooseDay('19');

      expect(proposedTime()).toBe('none');
    });

    test('Hides the proposal on the Block tab, and draws it again on coming back', async () => {
      setup();
      await clickCalendar('tuesday morning');
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await chooseSecondOfferedTime();
      const proposed = proposedTime();
      expect(screen.getByTestId('proposed-time')).toHaveAttribute('data-label', 'Draft New Appointment');

      fireEvent.click(screen.getByRole('tab', { name: 'Block' }));
      expect(proposedTime()).toBe('none');

      // The form stays mounted behind the Block tab, so its time is still there to draw.
      fireEvent.click(screen.getByRole('tab', { name: 'Appointment' }));
      expect(proposedTime()).toBe(proposed);
    });

    test('Moves the mark to each new click, and the proposal only where Book would book', async () => {
      setup();
      await clickCalendar('tuesday morning');
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await chooseSecondOfferedTime();
      const proposed = proposedTime();

      // The day is already searched, so the time chosen is kept, and stays drawn.
      await clickCalendar('tuesday afternoon');
      expect(markedTime()).toBe(TUESDAY_AFTERNOON.toISOString());
      expect(proposedTime()).toBe(proposed);

      // Another day drops it.
      await clickCalendar('thursday');
      expect(markedTime()).toBe(THURSDAY_MORNING.toISOString());
      expect(proposedTime()).toBe('none');
    });
  });

  describe('Visit types that require information supporting prior authorization', () => {
    test('Will not book one until its codes are given', async () => {
      const post = vi.spyOn(medplum, 'post');
      setup();
      await clickCalendar();

      await fillAuthorizedBooking();
      await clickBook();

      expect(post.mock.calls.some(([url]) => String(url).includes('Appointment/$book'))).toBe(false);
      // Still open, with every other answer kept, so the codes are one field away.
      expect(bookingPaneHeading()).toBeInTheDocument();
    });

    test('Sends the codes to the server on the appointment itself', async () => {
      const post = vi.spyOn(medplum, 'post');
      setup();
      await clickCalendar();

      await fillAuthorizedBooking();
      await enterAuthorizationDetails();
      await clickBook();

      // On the appointment rather than beside it, so that the write that books the visit is the
      // same write that records what it was authorized for.
      const proposal = bookedProposal(post);
      expect(proposal.reasonCode).toEqual([{ coding: [DiagnosisCodes[0]] }]);
      expect(proposal.serviceType?.slice(1)).toEqual([{ coding: [ProcedureCodes[0]] }]);
      expect(getExtensionValue(proposal, SchedulingMedicalNecessityURI)).toBe(true);
    });

    test('Reports what was booked with the codes on it', async () => {
      const onBooked = vi.fn();
      setup(onBooked);
      await clickCalendar();

      await fillAuthorizedBooking();
      await enterAuthorizationDetails();
      await clickBook();

      // The host reads the codes off the appointment it is handed, so nothing extra is threaded
      // through the components between here and the form to carry them.
      const [booking] = onBooked.mock.calls[0] as [AppointmentBooking];
      expect(booking.appointments[0].reasonCode?.[0]?.coding?.[0]?.code).toBe(DiagnosisCodes[0].code);
      expect(booking.appointments[0].serviceType?.at(-1)?.coding?.[0]?.code).toBe(ProcedureCodes[0].code);
    });
  });

  describe('One pane at a time', () => {
    beforeEach(async () => {
      await medplum.createResource(BOOKED_VISIT);
    });

    /** Renders and waits for the visit the grid offers a click on to be loaded onto it. */
    async function setupWithVisit(): Promise<void> {
      setup();
      await settleAutocomplete();
    }

    test('Opening an appointment puts its details where the booking form was', async () => {
      await setupWithVisit();
      await clickCalendar();
      expect(bookingPaneHeading()).toBeInTheDocument();

      await clickBookedVisit();

      // The details take the pane over rather than opening beside or above it, so the
      // part-filled form is gone and the time it was holding is no longer marked.
      expect(detailsPane()).toBeInTheDocument();
      expect(bookingPaneHeading()).not.toBeInTheDocument();
      expect(markedTime()).toBe('none');
    });

    test('Clicking open time puts the booking form back over the details', async () => {
      await setupWithVisit();
      await clickBookedVisit();
      expect(detailsPane()).toBeInTheDocument();

      await clickCalendar();

      expect(bookingPaneHeading()).toBeInTheDocument();
      expect(detailsPane()).not.toBeInTheDocument();
    });
  });

  describe('Editing a visit from its details', () => {
    beforeEach(async () => {
      await medplum.createResource(MilesCooperPatient);
      await medplum.createResource(AUTHORIZED_VISIT);
    });

    function saveButton(): HTMLElement {
      return within(detailsPane() as HTMLElement).getByRole('button', { name: 'Save Changes' });
    }

    async function clickEdit(): Promise<void> {
      await act(async () => {
        fireEvent.click(within(detailsPane() as HTMLElement).getByRole('button', { name: 'Edit' }));
      });
      await settleAutocomplete();
    }

    test("Saves the codes against the workspace's value sets, and reports the appointment written", async () => {
      const onUpdated = vi.fn();
      setup(undefined, onUpdated);
      await settleAutocomplete();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: `click appointment ${AUTHORIZED_VISIT.id}` }));
      });
      await settleAutocomplete();
      await clickEdit();

      // The stub serves only the workspace's value sets, so finding a code proves the bindings reached the pane.
      await addRow('diagnosis');
      await enterCode(/diagnosis 2/i, DiagnosisCodes[1]);
      await act(async () => {
        fireEvent.click(saveButton());
      });
      await settleAutocomplete();

      expect(onUpdated).toHaveBeenCalledTimes(1);
      const [updated] = onUpdated.mock.calls[0] as [WithId<Appointment>];
      expect(updated.reasonCode).toEqual([{ coding: [DiagnosisCodes[0]] }, { coding: [DiagnosisCodes[1]] }]);
      expect(within(detailsPane() as HTMLElement).queryByRole('button', { name: 'Save Changes' })).toBeNull();

      // An edit only against the written appointment: against the one first opened, removing this code changes nothing.
      await clickEdit();
      await removePill(codePill(DiagnosisCodes[1]));
      expect(saveButton()).toBeEnabled();
    });
  });
});

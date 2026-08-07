// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Appointment } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import type { MockInstance } from 'vitest';
import {
  MainClinic,
  SatelliteClinic,
  SchedulingFixtures,
  SurgeryService,
  SurgicalFixtures,
  UltrasoundImagingService,
  buildFindBundle,
  buildProposedAppointment,
} from '../stories/scheduling';
import { typeInAutocomplete } from '../test-utils/asyncAutocomplete';
import { act, fireEvent, render, screen, waitFor, within } from '../test-utils/render';
import type { AppointmentFinderProps } from './AppointmentFinder';
import { AppointmentFinder } from './AppointmentFinder';
import { MAX_FIND_WINDOW_DAYS } from './AppointmentFinder.times';
import { MONTH_SCAN_COUNT } from './useMonthAvailability';

const medplum = new MockClient();

function setup(props: Partial<AppointmentFinderProps>): void {
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );
  render(<AppointmentFinder onBook={vi.fn()} {...props} />, wrapper);
}

/** Times on the 27th, in Eastern time, which the fixture service is configured for. */
const MORNING = '2026-07-27T13:00:00.000Z';
const AFTERNOON = '2026-07-27T17:30:00.000Z';

type FindStub = MockInstance<MockClient['get']>;

/**
 * Answers `$find` while letting every other request through. MockClient does not
 * implement the operation, but it does serve the Schedule search the wizard runs
 * first, and both go through `get`.
 * @param respond - Produces the response, or throws to fail the request.
 * @returns The spy standing in for `get`.
 */
function stubFind(respond: (url: URL) => Promise<unknown>): FindStub {
  const passThrough = medplum.get.bind(medplum);
  return vi
    .spyOn(medplum, 'get')
    .mockImplementation(((url: string | URL, options: never) =>
      url.toString().includes('$find') ? respond(new URL(url.toString())) : passThrough(url, options)) as never);
}

/**
 * Answers `$find` with a fixed set of proposed appointments.
 * @param appointments - The appointments to offer.
 * @returns The spy standing in for `get`.
 */
function stubFindResults(appointments: Appointment[] = [buildProposedAppointment({ start: MORNING })]): FindStub {
  return stubFind(async () => buildFindBundle(appointments));
}

/**
 * Answers `$find` with one morning time on each of the given days.
 *
 * The scan behind the calendar's marks is answered with all of them, and a search
 * only with the ones its own window covers, which is how the real operation
 * behaves and what makes the two tell different stories.
 *
 * @param days - The days with times on them, as `YYYY-MM-DD`.
 * @returns The spy standing in for `get`.
 */
function stubFindDays(days: string[]): FindStub {
  const times = days.map((date) => `${date}T13:00:00.000Z`);
  return stubFind(async (url) => {
    const window = toWindow(url);
    return buildFindBundle(
      times
        .filter((time) => {
          const at = new Date(time);
          return at >= window.start && at <= window.end;
        })
        .map((start) => buildProposedAppointment({ start }))
    );
  });
}

/**
 * The window one `$find` request covers.
 * @param url - The request URL.
 * @returns Both ends of the window it asked about.
 */
function toWindow(url: URL): { start: Date; end: Date } {
  return {
    start: new Date(url.searchParams.get('start') as string),
    end: new Date(url.searchParams.get('end') as string),
  };
}

function spanDays(window: { start: Date; end: Date }): number {
  return (window.end.getTime() - window.start.getTime()) / (24 * 60 * 60 * 1000);
}

/** The last instant of August 2026, where a scan of that month has to reach. */
const endOfAugust = new Date(2026, 7, 31, 23, 59, 59, 999);

/**
 * Returns a day of the month the calendar is showing.
 * @param date - The day of the month.
 * @returns The day's button.
 */
function day(date: string): HTMLElement {
  return screen.getByRole('button', { name: date });
}

/**
 * Extracts the `$find` URLs behind the times on screen.
 *
 * The finder runs two kinds of `$find`: the search whose times are read, and the
 * scan that marks the calendar's month. They are told apart by the count, since
 * only the scan asks for the ceiling.
 *
 * @param stub - The spy standing in for `get`.
 * @returns One URL per search request.
 */
function findUrls(stub: FindStub): URL[] {
  return allFindUrls(stub).filter((url) => url.searchParams.get('_count') !== MONTH_SCAN_COUNT.toString());
}

/**
 * Extracts the `$find` URLs behind the calendar's marks.
 * @param stub - The spy standing in for `get`.
 * @returns One URL per scan request.
 */
function scanUrls(stub: FindStub): URL[] {
  return allFindUrls(stub).filter((url) => url.searchParams.get('_count') === MONTH_SCAN_COUNT.toString());
}

function allFindUrls(stub: FindStub): URL[] {
  return stub.mock.calls
    .map((call) => call[0].toString())
    .filter((url) => url.includes('$find'))
    .map((url) => new URL(url));
}

/**
 * Returns the schedules of the most recent search.
 * @param stub - The spy standing in for `get`.
 * @returns The `schedule` parameters, in the order they were sent.
 */
function lastSchedules(stub: FindStub): string[] {
  return allFindUrls(stub).at(-1)?.searchParams.getAll('schedule') ?? [];
}

/**
 * Opens the list of actors that could fill a role.
 *
 * Queries are scoped to the field itself: an actor named in the results beside
 * it would otherwise match too, now that the criteria and the times share a
 * screen.
 *
 * @param role - The role being filled.
 * @returns The field, to query the open list within.
 */
function openList(role: 'provider' | 'room' | 'device'): HTMLElement {
  const field = screen.getByTestId(`actor-select-${role}`);
  act(() => {
    fireEvent.click(within(field).getByRole('button', { name: `Add ${role}` }));
  });
  return field;
}

/**
 * Adds an actor to a role.
 * @param role - The role being filled.
 * @param option - The actor's name.
 */
async function choose(role: 'provider' | 'room' | 'device', option: string): Promise<void> {
  const field = openList(role);
  const item = await within(field).findByText(option);
  await act(async () => {
    fireEvent.click(item);
  });
}

/**
 * Chooses a row out of one of the first step's lists.
 * @param label - The list's label.
 * @param name - The row's name, matched loosely so a described row still matches.
 */
async function pick(label: string, name: string): Promise<void> {
  const list = await screen.findByRole('radiogroup', { name: label });
  const row = await waitFor(() => {
    const found = screen.getAllByRole('radio', { name: new RegExp(name) }).find((radio) => list.contains(radio));
    if (!found) {
      throw new Error(`No ${label} row named ${name}`);
    }
    return found;
  });
  await act(async () => {
    fireEvent.click(row);
  });
}

/** Chooses the first offered time, which lands on the confirmation step. */
async function chooseFirstTime(): Promise<void> {
  const time = await screen.findByRole('button', { name: '9:00 AM' });
  await act(async () => {
    fireEvent.click(time);
  });
}

describe('AppointmentFinder', () => {
  beforeAll(async () => {
    for (const resource of [...SchedulingFixtures, ...SurgicalFixtures]) {
      await medplum.createResource(resource);
    }
  });

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-25T12:00:00.000Z'));
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('Starts by asking where and what, and cannot advance without a service', async () => {
    setup({});

    expect(screen.getByTestId('appointment-finder')).toBeInTheDocument();
    expect(await screen.findByRole('radiogroup', { name: 'Location' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Service type' })).toBeInTheDocument();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next' }).disabled).toBe(true);
  });

  test('Skips the first step when the caller fixes the service', async () => {
    stubFindResults();
    setup({ service: UltrasoundImagingService });

    // Straight to the questions the service's schedules imply, beside the times.
    expect(await screen.findByTestId('actor-select-provider')).toBeInTheDocument();
    expect(screen.getByTestId('actor-select-room')).toBeInTheDocument();
    expect(screen.getByTestId('actor-select-device')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Service type' })).not.toBeInTheDocument();
  });

  test('Reads back what is being booked, and where', async () => {
    stubFindResults();
    setup({ service: UltrasoundImagingService });

    // The answers from the first step are off screen by now, and the site in
    // particular decides which actors are even on offer.
    expect(await screen.findByText('Ultrasound Imaging')).toBeInTheDocument();
    expect(screen.getByText('Uro Associates - Main Clinic')).toBeInTheDocument();
  });

  test('Searches as soon as it has criteria, without being asked to', async () => {
    const find = stubFindResults();
    setup({ service: UltrasoundImagingService });

    expect(await screen.findByRole('button', { name: '9:00 AM' })).toBeInTheDocument();
    expect(findUrls(find)).toHaveLength(1);
  });

  test('Hands the step over to a caller that owns it', async () => {
    stubFindResults();
    const onStepChange = vi.fn();
    setup({ service: UltrasoundImagingService, step: 'times', onStepChange });

    await chooseFirstTime();

    expect(onStepChange).toHaveBeenCalledWith('confirm');
    // The caller has not moved it on, so the finder stays where it was put.
    expect(screen.getByTestId('actor-select-provider')).toBeInTheDocument();
    expect(screen.queryByTestId('appointment-summary')).not.toBeInTheDocument();
  });

  test('Takes the site from a service held at one, without asking', async () => {
    // The imaging service names the main clinic, so the satellite's room is not
    // somewhere this appointment could be held.
    stubFindResults();
    setup({ service: UltrasoundImagingService });

    await screen.findByTestId('actor-select-room');
    const rooms = within(openList('room'));

    expect(await rooms.findByText('Exam Room A')).toBeInTheDocument();
    expect(rooms.queryByText('Satellite Exam Room')).not.toBeInTheDocument();
  });

  test('Says so when everything for a service is held at another site', async () => {
    // The surgical team and its operating room are all at the main clinic, so
    // booking the surgery at the satellite leaves nothing to ask about.
    setup({ service: SurgeryService, location: SatelliteClinic });

    expect(await screen.findByText(/held elsewhere/)).toBeInTheDocument();
    expect(screen.queryByTestId('actor-select-provider')).not.toBeInTheDocument();
    expect(screen.queryByText('No schedules are configured for this service.')).not.toBeInTheDocument();
  });

  test('Offers only the rooms at the chosen site', async () => {
    stubFindResults();
    setup({ service: UltrasoundImagingService, location: MainClinic });

    await screen.findByTestId('actor-select-room');
    const rooms = within(openList('room'));

    // Exam Room B is a floor below the clinic rather than directly inside it.
    expect(await rooms.findByText('Exam Room A')).toBeInTheDocument();
    expect(rooms.getByText('Exam Room B')).toBeInTheDocument();
    expect(rooms.queryByText('Satellite Exam Room')).not.toBeInTheDocument();
  });

  test('Walks from a service to a chosen time', async () => {
    const find = stubFindResults();
    const onSelectAppointment = vi.fn();
    setup({ onSelectAppointment });

    await pick('Service type', 'Ultrasound Imaging');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });

    expect(await screen.findByTestId('actor-select-provider')).toBeInTheDocument();

    // 13:00 UTC is 9:00 in the service's Eastern timezone.
    await chooseFirstTime();

    expect(onSelectAppointment).toHaveBeenCalledTimes(1);
    expect(onSelectAppointment.mock.calls[0][1]).toStrictEqual({ available: true });
    const selected = onSelectAppointment.mock.calls[0][0] as Appointment;
    expect(selected.status).toBe('proposed');
    expect(selected.contained).toHaveLength(1);
    expect(findUrls(find)).toHaveLength(1);
    // Choosing a time is what asks for it to be confirmed.
    expect(await screen.findByTestId('appointment-summary')).toBeInTheDocument();
  });

  test('Books the appointment it assembled', async () => {
    stubFindResults();
    const onBook = vi.fn();
    setup({ service: UltrasoundImagingService, patient: HomerSimpson, onBook });

    await chooseFirstTime();

    const reason = await screen.findByRole('textbox', { name: /Reason for visit/ });
    await act(async () => {
      fireEvent.change(reason, { target: { value: 'Follow-up scan' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm and book appointment' }));
    });

    expect(onBook).toHaveBeenCalledTimes(1);
    const [appointment, options] = onBook.mock.calls[0] as [Appointment, { available: boolean }];
    expect(options).toStrictEqual({ available: true });
    // The proposal is passed on whole, with the patient and the notes added.
    expect(appointment.status).toBe('proposed');
    expect(appointment.contained).toHaveLength(1);
    expect(appointment.comment).toBe('Follow-up scan');
    expect(appointment.participant?.map((participant) => participant.actor?.reference)).toContain(
      `Patient/${HomerSimpson.id}`
    );
  });

  test('Will not book until a patient has been chosen', async () => {
    stubFindResults();
    const onBook = vi.fn();
    setup({ service: UltrasoundImagingService, onBook });

    await chooseFirstTime();

    expect(await screen.findByTestId('appointment-summary')).toBeInTheDocument();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Confirm and book appointment' }).disabled).toBe(true);
    expect(screen.getByText('Choose a patient')).toBeInTheDocument();
    expect(onBook).not.toHaveBeenCalled();
  });

  test('Carries the host’s own fields onto the last step, and lets it hold the booking', async () => {
    stubFindResults();
    const onBook = vi.fn();
    setup({
      service: UltrasoundImagingService,
      patient: HomerSimpson,
      onBook,
      additionalFields: (
        <label>
          CPT code
          <input name="cpt" />
        </label>
      ),
      bookDisabledReason: 'Enter a CPT code',
    });

    await chooseFirstTime();

    expect(await screen.findByRole('textbox', { name: 'CPT code' })).toBeInTheDocument();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Confirm and book appointment' }).disabled).toBe(true);
    expect(screen.getByText('Enter a CPT code')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm and book appointment' }));
    });
    expect(onBook).not.toHaveBeenCalled();
  });

  test('Tells two patients of one name apart by birth date and MRN, oldest first', async () => {
    stubFindResults();
    setup({ service: UltrasoundImagingService, onBook: vi.fn() });

    await chooseFirstTime();
    await typeInAutocomplete(await screen.findByPlaceholderText('Search by name'), 'Simpson');

    // Homer's MRN is the identifier typed as one, not the untyped pair ahead of it.
    expect(await screen.findByText('Born 5/12/1956 · MRN SG-000101')).toBeInTheDocument();
    const listed = screen.getAllByText(/Simpson$/).map((element) => element.textContent);
    expect(listed).toStrictEqual(['Homer Simpson', 'Bart Simpson']);
  });

  test('Says what it needs itself before saying what the host needs', async () => {
    stubFindResults();
    setup({ service: UltrasoundImagingService, bookDisabledReason: 'Enter a CPT code' });

    await chooseFirstTime();

    // No patient yet, and a billing code is not the thing to fix first.
    expect(await screen.findByText('Choose a patient')).toBeInTheDocument();
    expect(screen.queryByText('Enter a CPT code')).not.toBeInTheDocument();
  });

  test('Surfaces a failed booking', async () => {
    stubFindResults();
    const onBook = vi.fn().mockRejectedValue(new Error('Slot is already taken'));
    setup({ service: UltrasoundImagingService, patient: HomerSimpson, onBook });

    await chooseFirstTime();
    const confirm = await screen.findByRole('button', { name: 'Confirm and book appointment' });
    await act(async () => {
      fireEvent.click(confirm);
    });

    expect(await screen.findByText('Slot is already taken')).toBeInTheDocument();
  });

  test('Offers a way to create a patient who is not on file', async () => {
    stubFindResults();
    const onCreatePatient = vi.fn();
    setup({ service: UltrasoundImagingService, onCreatePatient });

    await chooseFirstTime();
    const newPatient = await screen.findByRole('button', { name: 'New patient' });
    await act(async () => {
      fireEvent.click(newPatient);
    });

    expect(onCreatePatient).toHaveBeenCalled();
  });

  test('Searches one provider and nothing else until more is asked for', async () => {
    const find = stubFindResults();
    setup({ service: UltrasoundImagingService, location: MainClinic });
    await waitFor(() => expect(findUrls(find)).toHaveLength(1));

    // Rooms and devices are optional, so leaving them empty searches the
    // provider's availability rather than narrowing it to a free room.
    const [url] = findUrls(find);
    expect(url.searchParams.getAll('schedule')).toStrictEqual(['Schedule/schedule-dr-rivera']);
    expect(url.searchParams.get('service-type-reference')).toBe('HealthcareService/ultrasound-imaging');
  });

  test('Intersects the schedules of every role that was filled in', async () => {
    const find = stubFindResults();
    setup({ service: UltrasoundImagingService, location: MainClinic });

    await screen.findByTestId('actor-select-provider');
    await choose('room', 'Exam Room A');
    await choose('device', 'Ultrasound 1 (Main Campus)');

    // One request, whose schedules $find intersects: the times all three are free.
    await waitFor(() =>
      expect(lastSchedules(find)).toStrictEqual([
        'Schedule/schedule-dr-rivera',
        'Schedule/schedule-exam-room-a',
        'Schedule/schedule-ultrasound-1',
      ])
    );
  });

  test('Asks for a time two providers are both free for', async () => {
    const find = stubFindResults();
    setup({ service: UltrasoundImagingService, location: MainClinic });

    await screen.findByTestId('actor-select-provider');
    await choose('provider', 'Dr. Tunde Okafor');

    // A surgery needing a surgeon and an anesthesiologist is asked for by naming
    // both in the one request, which $find answers by intersecting them, rather
    // than a request each offering whatever either is free for.
    await waitFor(() =>
      expect(lastSchedules(find)).toStrictEqual(['Schedule/schedule-dr-rivera', 'Schedule/schedule-dr-okafor'])
    );
  });

  test('Will not search without a provider', async () => {
    const find = stubFindResults();
    setup({ service: UltrasoundImagingService, location: MainClinic });
    await waitFor(() => expect(findUrls(find)).toHaveLength(1));

    // Dropping the provider leaves nobody to hold the appointment on.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Dr. Maya Rivera' }));
    });

    expect(screen.getByText('Choose at least one provider')).toBeInTheDocument();
    expect(screen.getByText('Choose a provider to see the times on offer.')).toBeInTheDocument();
    expect(findUrls(find)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '9:00 AM' })).not.toBeInTheDocument();
  });

  test('Searches the day picked out of the calendar', async () => {
    const find = stubFindResults();
    setup({ service: UltrasoundImagingService });
    await waitFor(() => expect(findUrls(find)).toHaveLength(1));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '30' }));
    });

    await waitFor(() => expect(findUrls(find).length).toBeGreaterThan(1));

    // One day, covered from its start to the last instant of it.
    const url = findUrls(find).at(-1) as URL;
    expect(new Date(url.searchParams.get('start') as string)).toStrictEqual(new Date(2026, 6, 30));
    expect(new Date(url.searchParams.get('end') as string)).toStrictEqual(new Date(2026, 6, 30, 23, 59, 59, 999));
    expect(screen.getByText('Thursday, July 30')).toBeInTheDocument();

    // Picking days out of the calendar is the whole of how the days are walked:
    // there is nothing under the times for stepping through them.
    expect(screen.queryByRole('button', { name: /more dates/i })).not.toBeInTheDocument();
  });

  test('Takes a time nobody offered, once the warning is accepted', async () => {
    stubFindResults();
    const onSelectAppointment = vi.fn();
    setup({ service: UltrasoundImagingService, location: MainClinic, allowCustomTime: true, onSelectAppointment });
    await screen.findByRole('button', { name: '9:00 AM' });

    // Asking for a time nobody offered is a corner of the flow, not the flow.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ask for a specific time' }));
    });
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Time' }), { target: { value: '11:15' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use this time' }));
    });

    expect(screen.getByText(/is not one of the times offered for Dr. Maya Rivera/)).toBeInTheDocument();
    expect(onSelectAppointment).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Schedule anyway' }));
    });

    const [appointment, options] = onSelectAppointment.mock.calls[0] as [Appointment, { available: boolean }];
    expect(options).toStrictEqual({ available: false });
    // 11:15 on the clinic's Eastern clock, for the service's configured 30
    // minutes, held on the chosen provider's schedule.
    expect(appointment.start).toBe('2026-07-27T15:15:00.000Z');
    expect(appointment.end).toBe('2026-07-27T15:45:00.000Z');
    expect(appointment.participant?.[0].actor?.reference).toBe('Practitioner/dr-rivera');
    expect(appointment.contained?.[0]).toMatchObject({ schedule: { reference: 'Schedule/schedule-dr-rivera' } });
    expect(appointment.serviceType?.[0].text).toBe('Ultrasound Imaging');
    // The warning follows it onto the step where it would be booked.
    expect(await screen.findByText('This time was not offered')).toBeInTheDocument();
  });

  test('Asks for a time on a search that found none, without a day having been picked', async () => {
    // Nothing this month, and no day picked, so there is no first day with times
    // to hang the request on. The day the search opens on is the one to ask about.
    stubFindDays([]);
    const onSelectAppointment = vi.fn();
    setup({ service: UltrasoundImagingService, location: MainClinic, allowCustomTime: true, onSelectAppointment });

    expect(await screen.findByText(/No available times match this search/)).toBeInTheDocument();
    // The hint sends the user to a card, so the card has to be there.
    expect(screen.getByText(/Ask for a specific time below/)).toBeInTheDocument();
    expect(screen.getByTestId('custom-time-card')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Time' }), { target: { value: '11:15' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use this time' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Schedule anyway' }));
    });

    // 11:15 Eastern on the earliest day the search covers, which is the first day
    // past the service's notice period rather than the first of the month.
    const [appointment] = onSelectAppointment.mock.calls[0] as [Appointment];
    expect(appointment.start).toBe('2026-07-25T15:15:00.000Z');
  });

  test('Offers no way around availability unless the caller allows it', async () => {
    stubFindResults();
    setup({ service: UltrasoundImagingService, location: MainClinic });
    // Booking over the schedule is for whoever the host says may overrule it, so
    // it is off until asked for rather than on until forbidden.
    expect(await screen.findByRole('button', { name: '9:00 AM' })).toBeInTheDocument();
    expect(screen.queryByTestId('custom-time-card')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask for a specific time' })).not.toBeInTheDocument();
  });

  test('Never asks for times inside the notice window', async () => {
    const find = stubFindResults();
    setup({ service: UltrasoundImagingService, minimumNoticeMinutes: 90 });
    await waitFor(() => expect(findUrls(find)).toHaveLength(1));

    // The default range opens today, so the lead time is what decides the start.
    const start = new Date(findUrls(find)[0].searchParams.get('start') as string);
    const noticeMinutes = (start.getTime() - Date.parse('2026-07-25T12:00:00.000Z')) / 60000;
    expect(noticeMinutes).toBeCloseTo(90, 1);
  });

  test('Searches from now without being asked for any dates', async () => {
    const find = stubFindResults();
    setup({ service: UltrasoundImagingService });
    await waitFor(() => expect(findUrls(find)).toHaveLength(1));

    // The month on display, rather than everything the schedules have ever been
    // open for: it is the month the calendar is marking, and stopping short of it
    // would leave a quiet fortnight looking like a quiet month.
    const [window] = findUrls(find).map(toWindow);
    expect(window.start.getTime()).toBeGreaterThan(Date.parse('2026-07-25T12:00:00.000Z'));
    expect(window.end).toStrictEqual(new Date(2026, 6, 31, 23, 59, 59, 999));
  });

  test('Opens on the soonest day of the month, however far into it that falls', async () => {
    // Nothing until the end of the month, where a fortnight-long search would
    // have found nothing at all and said so.
    stubFindDays(['2026-07-30']);
    setup({ service: UltrasoundImagingService });
    expect(await screen.findByRole('button', { name: '9:00 AM' })).toBeInTheDocument();
    expect(screen.getAllByText('Thursday, July 30')).not.toHaveLength(0);
    expect(screen.queryByText(/No available times match this search/)).not.toBeInTheDocument();
  });

  test('Marks every day of the month with times, not only the day being read', async () => {
    const find = stubFindDays(['2026-07-27', '2026-07-28', '2026-07-30']);
    setup({ service: UltrasoundImagingService });
    await waitFor(() => expect(day('27').className).toContain('available'));
    expect(day('28').className).toContain('available');
    expect(day('30').className).toContain('available');
    expect(day('29').className).not.toContain('available');

    await act(async () => {
      fireEvent.click(day('30'));
    });
    await waitFor(() => expect(screen.getAllByText('Thursday, July 30')).not.toHaveLength(0));

    // Reading one day is not a claim about the others: the scan behind the marks
    // is asked about the month, so picking a day out of it does not empty it.
    expect(scanUrls(find)).toHaveLength(1);
    expect(day('28').className).toContain('available');
    expect(day('27').className).toContain('available');
  });

  test('Opens on this month, with the days already gone closed off', async () => {
    // The clock is at midday on 25 July, so the days before it have passed.
    const find = stubFindDays(['2026-07-20', '2026-07-27', '2026-07-28']);
    setup({ service: UltrasoundImagingService });
    await waitFor(() => expect(day('27').className).toContain('available'));
    expect(screen.getByText('July 2026')).toBeInTheDocument();

    // Nothing is scanned before the lead time, so a day in the past cannot be
    // marked as having times, and cannot be asked about either.
    expect(day('20').className).not.toContain('available');
    expect(day('20')).toBeDisabled();
    expect(day('24')).toBeDisabled();
    expect(day('25')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();

    // The scan never asks about a day that has gone.
    for (const window of scanUrls(find).map(toWindow)) {
      expect(window.start.getTime()).toBeGreaterThanOrEqual(Date.parse('2026-07-25T12:00:00.000Z'));
    }
  });

  test('Scans the month on display, in windows the operation accepts', async () => {
    const find = stubFindResults();
    setup({ service: UltrasoundImagingService });
    await waitFor(() => expect(scanUrls(find)).not.toHaveLength(0));

    const legs = scanUrls(find).map(toWindow);
    // The month is scanned from the lead time — days already gone hold nothing —
    // through its last day.
    expect(legs[0].start.getTime()).toBeGreaterThan(Date.parse('2026-07-25T12:00:00.000Z'));
    expect(legs.at(-1)?.end).toStrictEqual(new Date(2026, 6, 31, 23, 59, 59, 999));
    for (const leg of legs) {
      expect(spanDays(leg)).toBeLessThanOrEqual(MAX_FIND_WINDOW_DAYS);
    }
  });

  test('Follows the calendar to the month the user pages to', async () => {
    const find = stubFindResults();
    setup({ service: UltrasoundImagingService });
    await waitFor(() => expect(scanUrls(find)).not.toHaveLength(0));

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next month'));
    });

    // August is 31 days, which is one day more than a single request may cover.
    await waitFor(() => expect(scanUrls(find).map(toWindow).at(-1)?.end).toStrictEqual(endOfAugust));
    const august = scanUrls(find).map(toWindow).slice(1);
    expect(august[0].start).toStrictEqual(new Date(2026, 7, 1));
    for (const leg of august) {
      expect(spanDays(leg)).toBeLessThanOrEqual(MAX_FIND_WINDOW_DAYS);
    }

    // The times follow the month too, rather than staying in the month just left.
    const searched = findUrls(find).map(toWindow).at(-1);
    expect(searched?.start).toStrictEqual(new Date(2026, 7, 1));
  });
  test('Says where the marks stop when a month holds more times than one scan can count', async () => {
    // A month busy enough to fill the scan's count, which answers the days it
    // reached and says nothing at all about the ones after them.
    stubFind(async (url) => {
      if (url.searchParams.get('_count') !== MONTH_SCAN_COUNT.toString()) {
        return buildFindBundle([buildProposedAppointment({ start: MORNING })]);
      }
      const from = new Date(url.searchParams.get('start') as string);
      return buildFindBundle(
        Array.from({ length: MONTH_SCAN_COUNT }, (_unused, index) =>
          buildProposedAppointment({ start: new Date(from.getTime() + index * 5 * 60 * 1000).toISOString() })
        )
      );
    });
    setup({ service: UltrasoundImagingService });
    // Otherwise the rest of the month would be drawn exactly like a month with
    // nothing free in it.
    expect(await screen.findByText(/Days marked as far as/)).toBeInTheDocument();
  });

  test('Dragging a stretch of days on the calendar shows all of them at once', async () => {
    stubFindResults([
      buildProposedAppointment({ start: MORNING }),
      buildProposedAppointment({ start: '2026-07-28T13:00:00.000Z' }),
      buildProposedAppointment({ start: '2026-07-29T13:00:00.000Z' }),
    ]);
    setup({ service: UltrasoundImagingService });
    // A day at a time, until the scheduler says which days they mean.
    expect(await screen.findByText('Monday, July 27')).toBeInTheDocument();
    expect(screen.queryByText('Tuesday, July 28')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.pointerDown(screen.getByRole('button', { name: '27' }));
    });
    await act(async () => {
      fireEvent.pointerOver(screen.getByRole('button', { name: '29' }));
    });
    await act(async () => {
      fireEvent.pointerUp(window);
    });

    // Asking about three days is asking about all three, so none of them is
    // behind a button.
    expect(await screen.findByText('Tuesday, July 28')).toBeInTheDocument();
    expect(screen.getByText('Wednesday, July 29')).toBeInTheDocument();
    expect(screen.getByText('Monday, July 27 – Wednesday, July 29')).toBeInTheDocument();
  });

  test('Reads a day picked out of a month the calendar was paged to', async () => {
    const find = stubFindDays(['2026-08-05']);
    setup({ service: UltrasoundImagingService });
    // Nothing left in this month, so the way on is wherever the calendar is taken.
    expect(await screen.findByText(/No available times match this search/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next month'));
    });
    await waitFor(() => expect(day('5').className).toContain('available'));

    await act(async () => {
      fireEvent.click(day('5'));
    });

    // That one day, in the month it belongs to.
    await waitFor(() => expect(findUrls(find).map(toWindow).at(-1)?.start).toStrictEqual(new Date(2026, 7, 5)));
    expect(findUrls(find).map(toWindow).at(-1)?.end).toStrictEqual(new Date(2026, 7, 5, 23, 59, 59, 999));
    expect(await screen.findByRole('button', { name: '9:00 AM' })).toBeInTheDocument();
  });

  test('Stops at the end date when one is given', async () => {
    const find = stubFindResults();
    setup({
      service: UltrasoundImagingService,
      defaultDateRange: { end: new Date(2026, 6, 31) },
    });
    await waitFor(() => expect(findUrls(find)).toHaveLength(1));

    // The last day asked for is covered in full, and there is nothing past it.
    const end = new Date(findUrls(find)[0].searchParams.get('end') as string);
    expect(end).toStrictEqual(new Date(2026, 6, 31, 23, 59, 59, 999));
    expect(await screen.findByRole('button', { name: '9:00 AM' })).toBeInTheDocument();
  });

  test('Offers nothing when the notice window closes the requested range', async () => {
    const find = stubFindResults();
    setup({
      service: UltrasoundImagingService,
      // A range that has already passed. Searching forward from the lead time
      // would return a month of times nobody asked for.
      defaultDateRange: { start: new Date(2026, 5, 1), end: new Date(2026, 5, 2) },
    });
    expect(await screen.findByText(/No available times match this search/)).toBeInTheDocument();
    expect(findUrls(find)).toHaveLength(0);
  });

  test('Filters the results by time of day', async () => {
    stubFindResults([buildProposedAppointment({ start: MORNING }), buildProposedAppointment({ start: AFTERNOON })]);
    setup({ service: UltrasoundImagingService });
    expect(await screen.findByRole('button', { name: '9:00 AM' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Afternoon'));
    });

    expect(await screen.findByRole('button', { name: '1:30 PM' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '9:00 AM' })).not.toBeInTheDocument();
  });

  test('Goes back from confirming to change the time', async () => {
    stubFindResults();
    setup({ service: UltrasoundImagingService });

    await chooseFirstTime();
    await screen.findByTestId('appointment-summary');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    });

    expect(screen.getByTestId('actor-select-provider')).toBeInTheDocument();
    expect(screen.queryByTestId('appointment-summary')).not.toBeInTheDocument();
  });

  test('Cannot go back past a fixed service', async () => {
    stubFindResults();
    setup({ service: UltrasoundImagingService });

    await screen.findByTestId('actor-select-provider');
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

    // The stepper header is not a way around that.
    await act(async () => {
      fireEvent.click(screen.getByText('Location and service'));
    });

    expect(screen.getByTestId('actor-select-provider')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Service type' })).not.toBeInTheDocument();
  });

  test('Refuses to search a range the operation would reject', async () => {
    const find = stubFindResults();
    setup({
      service: UltrasoundImagingService,
      defaultDateRange: { start: new Date(2026, 6, 27), end: new Date(2026, 6, 20) },
    });
    expect(await screen.findByText('The end date must be after the start date')).toBeInTheDocument();
    expect(findUrls(find)).toHaveLength(0);
  });

  test('Names who the appointment is for', async () => {
    stubFindResults();
    setup({ service: UltrasoundImagingService, patient: HomerSimpson });
    expect(await screen.findByText(/Scheduling for/)).toBeInTheDocument();
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Surfaces a failed search', async () => {
    stubFind(async () => {
      throw new Error('Schedule is not schedulable for requested service type');
    });
    setup({ service: UltrasoundImagingService });
    expect(await screen.findByText('Schedule is not schedulable for requested service type')).toBeInTheDocument();
  });

  test('Cancels when asked', async () => {
    stubFindResults();
    const onCancel = vi.fn();
    setup({ service: UltrasoundImagingService, onCancel });

    await screen.findByTestId('actor-select-provider');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });

    expect(onCancel).toHaveBeenCalled();
  });
});

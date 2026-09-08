// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CPT, extractServiceTypeReferences, getExtensionValue, SchedulingMedicalNecessityURI } from '@medplum/core';
import type { Appointment, Device } from '@medplum/fhirtypes';
import type { MockClient } from '@medplum/mock';
import type { JSX } from 'react';
import { installFindStub } from '../stories/mockFind';
import { installValueSetStub } from '../stories/mockValueSet';
import {
  AuthorizationValueSets,
  DIAGNOSIS_VALUE_SET,
  DiagnosisCodes,
  ElderJordanPatient,
  InfusionService,
  MainClinic,
  MRN_SYSTEM,
  PROCEDURE_VALUE_SET,
  ProcedureCodes,
  SatelliteClinic,
  SurgeryService,
  TelehealthService,
  Ultrasound1Device,
  UltrasoundImagingService,
  UntypedMrnPatient,
  YoungerJordanPatient,
} from '../stories/scheduling';
import {
  clickAutocompleteOption,
  installAutocompleteTimers,
  settleAutocomplete,
  typeInAutocomplete,
} from '../test-utils/asyncAutocomplete';
import {
  bookButton,
  chooseActor,
  chooseAuthorizedService,
  chooseDay,
  chooseFirstOfferedTime,
  chooseImagingService,
  choosePatient,
  chooseSecondOfferedTime,
  chooseSite,
  chosenTimeField,
  clickBook,
  codePill,
  confirmMedicalNecessity,
  dayCell,
  dragDays,
  enterAuthorizationDetails,
  enterCode,
  field,
  fillAuthorizedBooking,
  fillBooking,
  finderButton,
  findRequests,
  hasPill,
  isBefore,
  lastFindEnd,
  lastFindParams,
  lastFindStart,
  medicalNecessityBox,
  MONDAY_MORNING,
  openRoleField,
  openTimeFinder,
  patientDetail,
  removePill,
  searchField,
  setupBookingClient,
  shiftChooseDay,
  showMoreDays,
  showNextMonth,
} from '../test-utils/bookingForm';
import { act, fireEvent, renderWithMedplum, screen, waitFor, within } from '../test-utils/render';
import type { AppointmentProposalFormProps } from './AppointmentProposalForm';
import { AppointmentProposalForm } from './AppointmentProposalForm';

/** The timezone the fixtures' visit type is held in, which is not the runner's. */
const SITE_TIMEZONE = 'America/New_York';

installAutocompleteTimers();

/** Stands in for whoever writes the booking. */
const onBook = vi.fn();

function setup(medplum: MockClient, props?: Partial<AppointmentProposalFormProps>): void {
  const element: JSX.Element = <AppointmentProposalForm onBook={onBook} {...props} />;
  renderWithMedplum(element, medplum);
}

/**
 * The proposal the form handed over, as it assembled it.
 * @returns The appointment `onBook` was called with.
 */
function proposedAppointment(): Appointment {
  const [proposal] = onBook.mock.calls[0] as [Appointment];
  return proposal;
}

describe('AppointmentProposalForm', () => {
  let medplum: MockClient;
  let restoreFind: () => void;
  let restoreValueSets: () => void;

  beforeEach(async () => {
    vi.setSystemTime(MONDAY_MORNING);
    onBook.mockClear();
    onBook.mockResolvedValue(undefined);
    medplum = await setupBookingClient();
    restoreFind = installFindStub(medplum);
    restoreValueSets = installValueSetStub(medplum, AuthorizationValueSets);
  });

  afterEach(() => {
    restoreValueSets();
    restoreFind();
  });

  describe('Choosing the resources a visit is held on', () => {
    test('Offers a field for all three roles', async () => {
      setup(medplum);
      await chooseImagingService();

      expect(field(/provider/i)).toBeInTheDocument();
      expect(field(/room/i)).toBeInTheDocument();
      expect(field(/device/i)).toBeInTheDocument();
    });

    test('Offers nothing to type into until a visit type is chosen', async () => {
      setup(medplum);
      await settleAutocomplete();

      for (const role of [/^Provider$/, /^Room$/, /^Device$/]) {
        expect(screen.queryByRole('searchbox', { name: role })).not.toBeInTheDocument();
        expect(screen.getByText(role)).toBeInTheDocument();
      }

      await chooseImagingService();

      expect(field(/provider/i)).toBeInTheDocument();
    });

    test('Offers no search until a provider is named, and says so', async () => {
      setup(medplum);
      await chooseImagingService();

      // A room alone holds a room but no calendar to book it against.
      await chooseActor(/room/i, 'exam', 'Exam Room A');

      expect(finderButton()).toBeDisabled();
      expect(screen.getByText('Choose at least one provider first.')).toBeInTheDocument();
      expect(screen.queryAllByTestId(/^slot-group-/)).toHaveLength(0);

      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');

      expect(finderButton()).toBeEnabled();
      expect(screen.queryByText('Choose at least one provider first.')).not.toBeInTheDocument();
    });

    test('Searches against the provider alone when the room and device are left empty', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();

      const [group] = await screen.findAllByTestId(/^slot-group-/);
      expect(within(group).getByText('Dr. Maya Rivera')).toBeInTheDocument();
      expect(within(group).queryByText('Exam Room A')).not.toBeInTheDocument();
    });

    test('Still offers a role the visit type has nothing configured for', async () => {
      setup(medplum);
      await chooseImagingService();

      const input = await openRoleField(/device/i);
      await typeInAutocomplete(input, 'nosuchdevice');

      expect(input).toBeEnabled();
      expect(await screen.findByText('No devices found')).toBeInTheDocument();
    });

    test('Naming two providers narrows the times to the ones both are free for', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await chooseActor(/provider/i, 'oka', 'Dr. Tunde Okafor');
      await openTimeFinder();

      // One set of actors, not two: `$find` intersects the schedules it is given. Now
      // that each day gets its own card, distinct groups are counted by testid, not length.
      const groups = await screen.findAllByTestId(/^slot-group-/);
      expect(new Set(groups.map((group) => group.dataset.testid)).size).toBe(1);
      expect(within(groups[0]).getByText('Dr. Maya Rivera')).toBeInTheDocument();
      expect(within(groups[0]).getByText('Dr. Tunde Okafor')).toBeInTheDocument();
    });
  });

  describe('Narrowing resources to the chosen site', () => {
    test('Offers a room that belongs to a place inside the chosen site', async () => {
      setup(medplum, { defaultLocation: MainClinic, defaultService: UltrasoundImagingService });
      await settleAutocomplete();

      await openRoleField(/room/i);

      // Exam Room B is `partOf` the second floor, which is `partOf` the clinic.
      expect(await screen.findByText('Exam Room B')).toBeInTheDocument();
      expect(screen.getByText('Exam Room A')).toBeInTheDocument();
      expect(screen.queryByText('Satellite Exam Room')).not.toBeInTheDocument();
    });

    test('Offers a device kept inside the chosen site', async () => {
      const sitedDevice: Device = { ...Ultrasound1Device, location: { reference: 'Location/second-floor' } };
      await medplum.updateResource(sitedDevice);
      setup(medplum, { defaultLocation: MainClinic, defaultService: UltrasoundImagingService });
      await settleAutocomplete();

      await openRoleField(/device/i);

      expect(await screen.findByText('Ultrasound 1 (Main Campus)')).toBeInTheDocument();
    });

    test('Offers a provider whose role names the chosen site', async () => {
      // Dr. Martinez's role names the main clinic itself, the only way a provider is sited.
      setup(medplum, { defaultLocation: MainClinic, defaultService: SurgeryService });
      await settleAutocomplete();

      const input = await openRoleField(/provider/i);
      await typeInAutocomplete(input, 'mart');

      expect(await screen.findByText('Dr. Maria Martinez')).toBeInTheDocument();
    });

    test('Leaves out a provider whose roles name another site', async () => {
      setup(medplum, { defaultLocation: SatelliteClinic, defaultService: SurgeryService });
      await settleAutocomplete();

      const input = await openRoleField(/provider/i);
      await typeInAutocomplete(input, 'mart');

      expect(await screen.findByText('No providers found')).toBeInTheDocument();
      expect(screen.queryByText('Dr. Maria Martinez')).not.toBeInTheDocument();
    });

    test('Leaves out a provider sited inside the chosen site rather than at it, while offering a room there', async () => {
      // A room is sited by walking `partOf`; a provider only by a role naming the
      // site exactly.
      setup(medplum, { defaultLocation: MainClinic, defaultService: UltrasoundImagingService });
      await settleAutocomplete();

      await openRoleField(/provider/i);
      expect(await screen.findByText('Dr. Maya Rivera')).toBeInTheDocument();
      expect(screen.queryByText('Dr. Ama Osei')).not.toBeInTheDocument();

      await openRoleField(/room/i);
      expect(await screen.findByText('Exam Room B')).toBeInTheDocument();
    });

    test('Keeps a resource that records nothing about where it is', async () => {
      setup(medplum, { defaultLocation: SatelliteClinic, defaultService: UltrasoundImagingService });
      await settleAutocomplete();

      await openRoleField(/device/i);

      // The devices record no location at all.
      expect(await screen.findByText('Ultrasound 1 (Main Campus)')).toBeInTheDocument();
    });

    test('Narrows nothing by location when no site is chosen', async () => {
      setup(medplum, { defaultService: UltrasoundImagingService });
      await settleAutocomplete();

      await openRoleField(/room/i);

      expect(await screen.findByText('Exam Room A')).toBeInTheDocument();
      expect(screen.getByText('Satellite Exam Room')).toBeInTheDocument();
    });
  });

  describe('Choosing where the visit is held', () => {
    test('Leaves a room and a bed out of the site field', async () => {
      setup(medplum);

      // Unscoped: a search that came back with nothing leaves no dropdown to scope to.
      await typeInAutocomplete(field(/location/i), 'Exam Room A');

      expect(await screen.findByText('Nothing found')).toBeInTheDocument();
      expect(screen.queryByText('Exam Room A')).not.toBeInTheDocument();
      expect(screen.queryByText('Exam Room A Bed 1')).not.toBeInTheDocument();
    });

    test('Offers a Location that records no physical type', async () => {
      setup(medplum);

      const listbox = await searchField(/location/i, 'Uro Associates');

      // Neither clinic declares one, and nothing requires it: the field excludes what
      // says it is a room rather than admitting only what says site.
      expect(within(listbox).getByText('Uro Associates - Main Clinic')).toBeInTheDocument();
      expect(within(listbox).getByText('Uro Associates - Satellite')).toBeInTheDocument();
    });

    test('Narrows the visit types to the chosen site, and says which site', async () => {
      setup(medplum);
      await chooseSite('Satellite', 'Uro Associates - Satellite');

      await typeInAutocomplete(field(/visit type/i), 'Ultrasound');

      expect(
        screen.getByText('Showing visit types offered at Uro Associates - Satellite, plus those not tied to a site.')
      ).toBeInTheDocument();
      // Imaging names the main clinic, and only a visit type naming this site exactly
      // is offered at it.
      expect(await screen.findByText('Nothing found')).toBeInTheDocument();
      expect(screen.queryByText('Ultrasound Imaging')).not.toBeInTheDocument();
    });
  });

  describe('Offering only times every named resource is free', () => {
    test('Offers the times the named resources share', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await chooseActor(/room/i, 'exam', 'Exam Room A');
      await openTimeFinder();

      const groups = await screen.findAllByTestId(/^slot-group-/);
      expect(new Set(groups.map((group) => group.dataset.testid)).size).toBe(1);
      expect(within(groups[0]).getByText('Dr. Maya Rivera')).toBeInTheDocument();
      expect(within(groups[0]).getByText('Exam Room A')).toBeInTheDocument();
    });

    test('Issues no request until the time search is opened', async () => {
      const get = vi.spyOn(medplum, 'get');
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');

      expect(get.mock.calls.filter(([url]) => String(url).includes('find'))).toHaveLength(0);
      expect(screen.queryAllByTestId(/^slot-group-/)).toHaveLength(0);

      await openTimeFinder();

      expect((await screen.findAllByTestId(/^slot-group-/)).length).toBeGreaterThan(0);
    });

    test('Says so when the search offers nothing', async () => {
      restoreFind();
      restoreFind = installFindStub(medplum, { empty: true });
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();

      expect(await screen.findByText('No times are available for this selection.')).toBeInTheDocument();
    });

    test('Replaces the times when another day is chosen', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      expect(await screen.findByText(/Monday, August 17/)).toBeInTheDocument();

      await chooseDay('18');

      await waitFor(() => expect(screen.getByText(/Tuesday, August 18/)).toBeInTheDocument());
      expect(screen.queryByText(/Monday, August 17/)).not.toBeInTheDocument();
    });

    test('Searches today from now rather than from midnight', async () => {
      const get = vi.spyOn(medplum, 'get');
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();

      // The calendar hands back local midnight, so picking today must not walk the
      // floor back: `$find` honours whatever `start` it is given, and would answer
      // with times that have already passed.
      await chooseDay('17');

      const start = lastFindStart(get);
      expect(start).toBeDefined();
      // Local midnight would be 07:00Z on this clock; the floor must not go back there.
      expect(new Date(start as string).getTime()).toBeGreaterThanOrEqual(MONDAY_MORNING.getTime());
    });
  });

  describe('Showing several days at a time', () => {
    test('Offers the day picked, and none of the days around it', async () => {
      const get = vi.spyOn(medplum, 'get');
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();

      expect(await screen.findByText(/Monday, August 17/)).toBeInTheDocument();
      // "Show more days" is what asks for the days after; a click asks only for its own.
      expect(screen.queryByText(/Tuesday, August 18/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Wednesday, August 19/)).not.toBeInTheDocument();

      await chooseDay('20');

      expect(await screen.findByText(/Thursday, August 20/)).toBeInTheDocument();
      expect(screen.queryByText(/Friday, August 21/)).not.toBeInTheDocument();
      // The window closes on the 21st because that is the site's next midnight; no time on
      // the 21st itself fits inside it.
      expect(new Date(lastFindParams(get)?.get('end') as string).getDate()).toBe(21);
    });

    test('Asks about the one day picked, with a page wide enough for it', async () => {
      const get = vi.spyOn(medplum, 'get');
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();

      const params = lastFindParams(get) as URLSearchParams;
      // `$find` only offers a time that fits inside the window, so one day is asked about
      // up to the following midnight rather than to the last instant of the day itself.
      expect(new Date(params.get('end') as string).getDate()).toBe(18);
      expect(Number(params.get('_count'))).toBe(50);
    });

    test('Adds the next two days under the ones already on screen', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await screen.findByText(/Monday, August 17/);

      await showMoreDays();

      expect(await screen.findByText(/Tuesday, August 18/)).toBeInTheDocument();
      expect(screen.getByText(/Wednesday, August 19/)).toBeInTheDocument();
      // Appended, not replaced: the days already answered stay on screen.
      expect(screen.getByText(/Monday, August 17/)).toBeInTheDocument();
    });

    test('Asks only about the days it is adding', async () => {
      const get = vi.spyOn(medplum, 'get');
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await screen.findByText(/Monday, August 17/);

      await showMoreDays();

      // Not the days already answered: re-asking would waste a request per click. It opens
      // on the midnight the first window closed on, which is the site's rather than the
      // viewer's: midnight in Eastern time is 04:00 UTC, the clock the runner keeps.
      expect(lastFindStart(get)).toBe('2026-08-18T04:00:00.000Z');
      expect(Number(lastFindParams(get)?.get('_count'))).toBe(100);
    });

    test('Names a day that offers nothing, so nothing is missing but the days nobody asked about', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();

      // 21st is a Friday; the clinic keeps no hours on the weekend "Show more days" reaches into.
      await chooseDay('21');
      await screen.findByText(/Friday, August 21/);

      await showMoreDays();

      expect(await screen.findByText(/Saturday, August 22/)).toBeInTheDocument();
      expect(screen.getByText(/Sunday, August 23/)).toBeInTheDocument();
      expect(screen.getAllByText('No times are offered on this day.')).toHaveLength(2);
    });

    test('Marks the days on show against the calendar, widening the range as it grows', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await screen.findByText(/Monday, August 17/);

      // Which days the times below belong to is otherwise only in their headings.
      expect(dayCell('17').className).toContain('selected');
      expect(dayCell('18').closest('td')?.className).not.toContain('inRange');

      await showMoreDays();

      await waitFor(() => expect(dayCell('18').closest('td')?.className).toContain('inRange'));
      expect(dayCell('19').closest('td')?.className).toContain('inRange');
      expect(dayCell('20').closest('td')?.className).not.toContain('inRange');
      // "Show more days" widens the range on show, so its new far end is marked
      // too, the same as the day first picked.
      expect(dayCell('17').className).toContain('selected');
      expect(dayCell('19').className).toContain('selected');
    });

    test('Puts the added days away when the named resources change', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await screen.findByText(/Monday, August 17/);
      await showMoreDays();
      expect(await screen.findByText(/Wednesday, August 19/)).toBeInTheDocument();

      await chooseActor(/provider/i, 'oka', 'Dr. Tunde Okafor');

      // The times on screen were one provider's alone, not times the pair share.
      await waitFor(() => expect(screen.queryByText(/Wednesday, August 19/)).not.toBeInTheDocument());
      expect(await screen.findByText(/Monday, August 17/)).toBeInTheDocument();
    });
  });

  describe('Choosing several days at once', () => {
    /** Gets as far as a time search open on the day the form starts on. */
    async function openFinder(): Promise<void> {
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await screen.findByText(/Monday, August 17/);
    }

    test('Searches every day a drag covered', async () => {
      setup(medplum);
      await openFinder();

      await dragDays('17', '21');

      expect(await screen.findByText(/Friday, August 21/)).toBeInTheDocument();
      expect(screen.getByText(/Monday, August 17/)).toBeInTheDocument();
      expect(screen.getByText(/Thursday, August 20/)).toBeInTheDocument();
      // Stopped at the Friday, so the weekend after it was never asked about.
      expect(screen.queryByText(/Saturday, August 22/)).not.toBeInTheDocument();
    });

    test('Asks about the whole stretch in one window, not one request per day', async () => {
      const get = vi.spyOn(medplum, 'get');
      setup(medplum);
      await openFinder();
      get.mockClear();

      await dragDays('17', '21');

      // `$find` pages a window at once: one request for all five days, wide enough to hold them.
      expect(findRequests(get)).toHaveLength(1);
      const params = lastFindParams(get) as URLSearchParams;
      expect(new Date(params.get('end') as string).getDate()).toBe(22);
      expect(Number(params.get('_count'))).toBe(250);
    });

    test('Marks both ends of a stretch that was picked on purpose', async () => {
      setup(medplum);
      await openFinder();

      await dragDays('17', '21');

      // Unlike a picked day, where only that day is marked: every day of a picked
      // stretch was asked for, so every day is marked.
      await waitFor(() => expect(dayCell('21').className).toContain('selected'));
      expect(dayCell('17').className).toContain('selected');
      expect(dayCell('19').closest('td')?.className).toContain('inRange');
      expect(dayCell('22').closest('td')?.className).not.toContain('inRange');
    });

    test('Shift-clicking widens the days searched, holding the end it is not moving', async () => {
      const get = vi.spyOn(medplum, 'get');
      setup(medplum);
      await openFinder();
      await chooseDay('18');
      await screen.findByText(/Tuesday, August 18/);

      await shiftChooseDay('21');

      expect(await screen.findByText(/Friday, August 21/)).toBeInTheDocument();
      // Grew from the day picked, rather than starting over at the day shift-clicked.
      expect(screen.getByText(/Tuesday, August 18/)).toBeInTheDocument();
      expect(new Date(lastFindParams(get)?.get('end') as string).getDate()).toBe(22);
    });

    test('Searches a stretch reaching back over today from now rather than from midnight', async () => {
      const get = vi.spyOn(medplum, 'get');
      setup(medplum);
      await openFinder();
      await chooseDay('20');
      await screen.findByText(/Thursday, August 20/);

      // 17th is today: the stretch now reaches back over a day already under way.
      await shiftChooseDay('17');

      expect(await screen.findByText(/Monday, August 17/)).toBeInTheDocument();
      const start = new Date(lastFindStart(get) as string);
      expect(start.getTime()).toBeGreaterThanOrEqual(MONDAY_MORNING.getTime());
    });

    test('Refuses a stretch longer than one `$find` window', async () => {
      const get = vi.spyOn(medplum, 'get');
      setup(medplum);
      await openFinder();
      get.mockClear();

      await showNextMonth();
      await shiftChooseDay('20');

      // Caught before the request, not by a refusal coming back.
      expect(await screen.findByText('Choose at most 31 days at a time.')).toBeInTheDocument();
      expect(findRequests(get)).toHaveLength(0);
    });

    test('Adds days under a stretch that was picked', async () => {
      setup(medplum);
      await openFinder();
      await dragDays('17', '21');
      await screen.findByText(/Friday, August 21/);

      await showMoreDays();

      expect(await screen.findByText(/Saturday, August 22/)).toBeInTheDocument();
      expect(screen.getByText(/Sunday, August 23/)).toBeInTheDocument();
      expect(screen.getByText(/Monday, August 17/)).toBeInTheDocument();
    });

    test('Puts the added days away back to the stretch that was picked', async () => {
      setup(medplum);
      await openFinder();
      await dragDays('17', '21');
      await screen.findByText(/Friday, August 21/);
      await showMoreDays();
      expect(await screen.findByText(/Sunday, August 23/)).toBeInTheDocument();

      await chooseActor(/provider/i, 'oka', 'Dr. Tunde Okafor');

      // Only what "Show more days" added goes away; the picked stretch stays as the search.
      await waitFor(() => expect(screen.queryByText(/Sunday, August 23/)).not.toBeInTheDocument());
      expect(screen.getByText(/Friday, August 21/)).toBeInTheDocument();
      expect(screen.getByText(/Monday, August 17/)).toBeInTheDocument();
    });

    test('Clears the chosen time when a stretch is picked', async () => {
      setup(medplum);
      await openFinder();
      await chooseFirstOfferedTime();
      expect(chosenTimeField()).not.toBeNull();

      await dragDays('17', '21');

      // A proposal carries the Slots it was found for, and the search has moved on.
      expect(chosenTimeField()).toBeNull();
    });

    test('Names the days being searched, without the weekdays their headings carry', async () => {
      setup(medplum);
      await openFinder();

      expect(screen.getByText(/^August 17 · drag or shift-click/)).toBeInTheDocument();

      await dragDays('17', '21');

      expect(await screen.findByText(/August 17 – August 21 · drag or shift-click/)).toBeInTheDocument();
    });
  });

  describe('Reading times in the site’s timezone', () => {
    test('Shows an offered time as the time at the site', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();

      const [group] = await screen.findAllByTestId(/^slot-group-/);
      const [firstTime] = within(group).getAllByRole('button');
      // The stub lays times on the clinic's open hours in the runner's timezone, so the
      // label is that instant read at the site rather than 9:00 repeated.
      const start = new Date(2026, 7, 17, 9, 0, 0);

      expect(firstTime).toHaveTextContent(
        new Intl.DateTimeFormat(undefined, {
          timeZone: SITE_TIMEZONE,
          hour: 'numeric',
          minute: '2-digit',
          // The viewer under the test runner does not share the site's timezone, so the zone is
          // named beside the time.
          timeZoneName: 'shortGeneric',
        }).format(start)
      );
    });

    test('Names the zone on the time that is about to be booked', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await chooseFirstOfferedTime();

      // The last time read before booking says which clock it is on, like the times offered.
      expect(chosenTimeField()?.value).toMatch(/\bET$/);
    });

    test('Asks for the day as the site keeps it, not as the booker does', async () => {
      const get = vi.spyOn(medplum, 'get');
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();

      await chooseDay('18');

      // Bounded on the runner's clock this would run 00:00Z to 23:59Z, which is 8pm on the
      // 17th to 8pm on the 18th at the site: the clinic's morning missed, and its evening
      // fetched under the following day's heading.
      expect(lastFindStart(get)).toBe('2026-08-18T04:00:00.000Z');
      // `$find` only offers a time that fits inside the window, so it runs to the site's
      // next midnight: stopping short would drop the last hours the clinic is open.
      expect(lastFindEnd(get)).toBe('2026-08-19T04:00:00.000Z');
    });

    test('Records the instant the site-local time stands for', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      const label = await chooseFirstOfferedTime();

      expect(chosenTimeField()?.value).toContain(label);
    });
  });

  describe('Booking only a time that was offered', () => {
    test('Shows nothing standing in for a time before one is chosen', async () => {
      setup(medplum);
      await chooseImagingService();

      expect(finderButton()).toHaveTextContent('Find a time');
      expect(chosenTimeField()).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: /date|time/i })).not.toBeInTheDocument();
    });

    test('Shows the time that was picked in a field above the action', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await chooseActor(/room/i, 'exam', 'Exam Room A');
      await openTimeFinder();

      expect(chosenTimeField()).not.toBeInTheDocument();
      const label = await chooseFirstOfferedTime();

      const chosen = chosenTimeField() as HTMLInputElement;
      expect(chosen.value).toContain(label);
      expect(isBefore(chosen, finderButton())).toBe(true);
      // Off the proposal, so what the field commits to is what `$book` would be handed.
      expect(chosen).toHaveAccessibleDescription('30 min visit · Provider: Dr. Maya Rivera · Room: Exam Room A');
    });

    test('Offers no way to type or amend the chosen time', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await chooseFirstOfferedTime();

      const shown = (chosenTimeField() as HTMLInputElement).value;
      await act(async () => {
        fireEvent.change(chosenTimeField() as HTMLInputElement, { target: { value: 'Monday, August 17 at 11:59 PM' } });
      });

      expect(chosenTimeField()).toHaveAttribute('readonly');
      expect(chosenTimeField()?.value).toBe(shown);
      expect(screen.getAllByRole('textbox', { name: /date|time/i })).toHaveLength(1);
      expect(finderButton()).toBeInTheDocument();
    });

    test('Offers to change the time once one is chosen', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await chooseFirstOfferedTime();

      await act(async () => {
        fireEvent.click(finderButton());
      });
      await settleAutocomplete();

      expect(finderButton()).toHaveTextContent('Change time');
      expect(screen.queryByRole('button', { name: /^find a time$/i })).not.toBeInTheDocument();
    });

    test('Clears the chosen time when the day changes', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await chooseFirstOfferedTime();

      await chooseDay('18');

      expect(chosenTimeField()).not.toBeInTheDocument();
    });
  });

  describe('Clearing answers that no longer hold', () => {
    test('Replacing the provider clears the time, so no booking can hold the old one', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await chooseFirstOfferedTime();
      expect(chosenTimeField()).toHaveAccessibleDescription(/Dr. Maya Rivera/);

      await removePill('Dr. Maya Rivera');
      await chooseActor(/provider/i, 'oka', 'Dr. Tunde Okafor');

      // A chosen time is a proposal carrying its own participants and Slots. Kept
      // through this it would book Dr. Rivera while the form showed Dr. Okafor, and
      // `$book` would accept it: that time genuinely was Dr. Rivera's.
      expect(chosenTimeField()).not.toBeInTheDocument();

      const label = await chooseFirstOfferedTime();

      const chosen = chosenTimeField() as HTMLInputElement;
      expect(chosen.value).toContain(label);
      expect(chosen).toHaveAccessibleDescription(/Dr. Tunde Okafor/);
      expect(chosen).not.toHaveAccessibleDescription(/Dr. Maya Rivera/);
    });

    test.each([
      ['added', async (): Promise<void> => chooseActor(/room/i, 'exam', 'Exam Room A')],
      ['removed', async (): Promise<void> => removePill('Exam Room A')],
    ])('A room %s after a time was chosen clears it', async (_change, changeRoom) => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      if (_change === 'removed') {
        await chooseActor(/room/i, 'exam', 'Exam Room A');
      }
      await openTimeFinder();
      await chooseFirstOfferedTime();
      expect(chosenTimeField()).toBeInTheDocument();

      await changeRoom();

      // A time found without a room's availability is not a time that room is free for,
      // and one found with it does not hold once the room is dropped.
      expect(chosenTimeField()).not.toBeInTheDocument();
    });

    test('A resource change leaves the search open and re-runs it', async () => {
      const onToggleTimeFinder = vi.fn();
      setup(medplum, { onToggleTimeFinder });
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await chooseFirstOfferedTime();
      onToggleTimeFinder.mockClear();

      await chooseActor(/room/i, 'exam', 'Exam Room A');

      // Closing here would take back the panel width the host just widened, mid-task.
      expect(finderButton()).toHaveTextContent('Close time finder');
      expect(onToggleTimeFinder).not.toHaveBeenCalled();
      const [group] = await screen.findAllByTestId(/^slot-group-/);
      expect(within(group).getByText('Dr. Maya Rivera')).toBeInTheDocument();
      expect(within(group).getByText('Exam Room A')).toBeInTheDocument();
    });

    test('Dropping the last provider closes the search, and says so', async () => {
      const onToggleTimeFinder = vi.fn();
      setup(medplum, { onToggleTimeFinder });
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await screen.findAllByTestId(/^slot-group-/);

      await removePill('Dr. Maya Rivera');

      expect(screen.queryAllByTestId(/^slot-group-/)).toHaveLength(0);
      expect(onToggleTimeFinder).toHaveBeenLastCalledWith(false);
    });

    test('Clears the chosen resources and time when the visit type changes', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await chooseFirstOfferedTime();
      expect(chosenTimeField()).toBeInTheDocument();

      await removePill('Ultrasound Imaging');
      await typeInAutocomplete(field(/visit type/i), 'Bariatric');
      await clickAutocompleteOption('Bariatric Surgery');
      await settleAutocomplete();

      expect(chosenTimeField()).not.toBeInTheDocument();
      // A surviving pill would be handed back on the next pick, and searched against a
      // schedule the new visit type cannot book.
      expect(hasPill('Dr. Maya Rivera')).toBe(false);
    });

    test('Clears the chosen resources when the site changes', async () => {
      setup(medplum, { defaultService: UltrasoundImagingService });
      await settleAutocomplete();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      expect(hasPill('Dr. Maya Rivera')).toBe(true);

      await chooseSite('Main Clinic', 'Uro Associates - Main Clinic');

      expect(hasPill('Dr. Maya Rivera')).toBe(false);
      // The imaging service is held there, so that answer stands.
      expect(hasPill('Ultrasound Imaging')).toBe(true);
    });

    test('Clears the visit type when the new site does not hold it', async () => {
      setup(medplum, { defaultService: SurgeryService });
      await settleAutocomplete();
      expect(hasPill('Bariatric Surgery')).toBe(true);

      // Surgery is held at the main clinic only.
      await chooseSite('Satellite', 'Uro Associates - Satellite');

      expect(hasPill('Bariatric Surgery')).toBe(false);
    });

    test('Keeps a visit type the new site does hold', async () => {
      setup(medplum, { defaultService: UltrasoundImagingService });
      await settleAutocomplete();

      await chooseSite('Main Clinic', 'Uro Associates - Main Clinic');

      // The imaging service names the main clinic, so the answer still stands.
      expect(hasPill('Ultrasound Imaging')).toBe(true);
    });

    test('Keeps a visit type that names no location when the site changes, and offers it there', async () => {
      setup(medplum, { defaultService: TelehealthService });
      await settleAutocomplete();
      expect(hasPill('Telehealth Consult')).toBe(true);

      await chooseSite('Main Clinic', 'Uro Associates - Main Clinic');

      // Never tied to a site, so no site invalidates it.
      expect(hasPill('Telehealth Consult')).toBe(true);

      // The predicate here and the pair of searches behind the field are one rule spelled
      // twice, and only a test through both catches them drifting apart. The field hides
      // its search box while it holds an answer, so asking costs the pill just asserted.
      await removePill('Telehealth Consult');
      const listbox = await searchField(/visit type/i, 'Telehealth');
      expect(within(listbox).getByText('Telehealth Consult')).toBeInTheDocument();
    });

    test('Collapses the time search when the visit type is cleared, and says so', async () => {
      const onToggleTimeFinder = vi.fn();
      setup(medplum, { onToggleTimeFinder });
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await screen.findAllByTestId(/^slot-group-/);

      await removePill('Ultrasound Imaging');

      expect(screen.queryAllByTestId(/^slot-group-/)).toHaveLength(0);
      expect(screen.queryByRole('button', { name: /close time finder/i })).not.toBeInTheDocument();
      expect(onToggleTimeFinder).toHaveBeenLastCalledWith(false);
    });

    test('Reports the visit type as it changes', async () => {
      const onChangeService = vi.fn();
      setup(medplum, { onChangeService });

      await chooseImagingService();

      expect(onChangeService).toHaveBeenCalledWith(expect.objectContaining({ id: 'ultrasound-imaging' }));
    });
  });

  describe('Mounting the form', () => {
    test('Starts with the answers the host pre-filled', async () => {
      setup(medplum, {
        defaultLocation: MainClinic,
        defaultService: UltrasoundImagingService,
        defaultPatient: ElderJordanPatient,
      });
      await settleAutocomplete();

      expect(screen.getByText(MainClinic.name as string)).toBeInTheDocument();
      expect(screen.getByText('Ultrasound Imaging')).toBeInTheDocument();
      expect(screen.getByText('Jordan Reyes')).toBeInTheDocument();
    });

    test('Reports the time search opening and closing', async () => {
      const onToggleTimeFinder = vi.fn();
      setup(medplum, { onToggleTimeFinder });
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      // Mounting is not an open or a close, so the host hears nothing until one.
      expect(onToggleTimeFinder).not.toHaveBeenCalled();

      await openTimeFinder();
      expect(onToggleTimeFinder).toHaveBeenLastCalledWith(true);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /close time finder/i }));
      });
      expect(onToggleTimeFinder).toHaveBeenLastCalledWith(false);
    });

    test('Reports the time as it is chosen', async () => {
      const onChangeTime = vi.fn();
      setup(medplum, { onChangeTime });
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      // Mounting has chosen nothing, and saying so would take down a marker a host
      // put up when it opened this form.
      expect(onChangeTime).not.toHaveBeenCalled();

      await chooseFirstOfferedTime();
      await choosePatient('Jordan', patientDetail(ElderJordanPatient, 'MRN-0041'));
      await clickBook();

      // The interval reported is the one that got booked, to the instant: a host
      // marking it on a calendar of its own is marking the visit itself.
      const proposal = proposedAppointment();
      expect(onChangeTime).toHaveBeenLastCalledWith({
        start: new Date(proposal.start as string),
        end: new Date(proposal.end as string),
      });
    });

    test('Reports the time being dropped when a different day is searched', async () => {
      const onChangeTime = vi.fn();
      setup(medplum, { onChangeTime });
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await chooseFirstOfferedTime();
      expect(onChangeTime).toHaveBeenLastCalledWith(expect.objectContaining({ start: expect.any(Date) }));

      await chooseDay('18');

      // The time was on the Monday, and the search has moved to the Tuesday. A host
      // hears that rather than keeping a marker on a time nobody has chosen.
      expect(onChangeTime).toHaveBeenLastCalledWith(undefined);
    });

    test('Opens the time search on the day the host named', async () => {
      // In the following month, so the month the calendar would otherwise open on
      // cannot pass this by accident.
      setup(medplum, { defaultService: UltrasoundImagingService, defaultStart: new Date(2026, 8, 2, 0, 0, 0) });
      await settleAutocomplete();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();

      expect(await screen.findByText(/Wednesday, September 2/)).toBeInTheDocument();
    });

    test('Opens on today when the day the host named has gone', async () => {
      setup(medplum, { defaultService: UltrasoundImagingService, defaultStart: new Date(2026, 7, 10, 0, 0, 0) });
      await settleAutocomplete();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();

      // Floored to now rather than searching from the stale day named.
      expect(await screen.findByText(/Monday, August 17/)).toBeInTheDocument();
      expect(screen.queryByText(/August 10/)).not.toBeInTheDocument();
    });
  });

  describe('Identifying the patient', () => {
    test('Asks for the patient below the action that finds a time', async () => {
      setup(medplum);

      // Naming a patient cannot change which times are offered, so asking for one
      // ahead of the search puts work that cannot affect the result in front of the
      // one control that can.
      expect(isBefore(finderButton(), field(/patient/i))).toBe(true);
    });

    test('Offers patients matching the name typed', async () => {
      setup(medplum);
      await typeInAutocomplete(field(/patient/i), 'Whitfield');

      expect(await screen.findByText('Sam Whitfield')).toBeInTheDocument();
      expect(screen.queryByText('Jordan Reyes')).not.toBeInTheDocument();
    });

    test('Tells apart two patients who share a name', async () => {
      setup(medplum);
      await typeInAutocomplete(field(/patient/i), 'Jordan');

      // The name is on both rows, so the birth date and the medical record
      // number under it are the only things separating them.
      expect(await screen.findByText(patientDetail(ElderJordanPatient, 'MRN-0041'))).toBeInTheDocument();
      expect(screen.getByText(patientDetail(YoungerJordanPatient))).toBeInTheDocument();
      expect(screen.getAllByText('Jordan Reyes')).toHaveLength(2);
    });

    test('Lists a patient with no medical record number by name and birth date', async () => {
      setup(medplum);
      await typeInAutocomplete(field(/patient/i), 'Jordan');

      // Hiding somebody because a number is missing would lose the patient, not
      // the ambiguity.
      expect(await screen.findByText(patientDetail(YoungerJordanPatient))).toBeInTheDocument();
    });

    test('Reads the medical record number from the system the host named', async () => {
      // Sam's identifier carries no type, so nothing but its system says what it
      // is. Without `mrnSystem` the same patient lists by birth date alone.
      setup(medplum, { mrnSystem: MRN_SYSTEM });
      await typeInAutocomplete(field(/patient/i), 'Whitfield');

      expect(await screen.findByText(patientDetail(UntypedMrnPatient, 'MRN-0099'))).toBeInTheDocument();
    });

    test('Leaves the patient out of the search for times', async () => {
      const get = vi.spyOn(medplum, 'get');
      setup(medplum);
      await fillBooking();

      // `$find` proposes times on calendars and knows nothing about who the
      // visit is for; the patient is attached on the way to `$book`.
      const searched = get.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('find'));
      expect(searched.length).toBeGreaterThan(0);
      expect(searched.some((url) => url.includes('Patient'))).toBe(false);
    });

    test('Asks nothing else below the action that finds a time', async () => {
      setup(medplum);

      // The free text about the visit that used to sit here is one of the fields a
      // practice configures, so the patient is the form's last question.
      const inputs = [...screen.getAllByRole('searchbox'), ...screen.queryAllByRole('textbox')];
      expect(inputs.filter((input) => isBefore(finderButton(), input))).toEqual([field(/patient/i)]);
    });

    test('Names the patient as a required participant, once', async () => {
      setup(medplum);
      await fillBooking();
      await clickBook();

      const participants = proposedAppointment().participant.filter(
        (participant) => participant.actor?.reference === `Patient/${ElderJordanPatient.id}`
      );
      expect(participants).toHaveLength(1);
      expect(participants[0].required).toBe('required');
    });
  });

  describe('Booking the appointment', () => {
    test('Hands the proposal it built over, writing and announcing nothing', async () => {
      const post = vi.spyOn(medplum, 'post');
      const notify = vi.spyOn(medplum, 'notifyResourceModified');
      setup(medplum);
      await fillBooking();
      await clickBook();

      expect(onBook).toHaveBeenCalledTimes(1);
      const proposal = proposedAppointment();
      expect(proposal.start).toBeDefined();
      expect(proposal.participant.some((p) => p.actor?.reference === `Patient/${ElderJordanPatient.id}`)).toBe(true);
      // Whoever owns the write owns invalidating its own caches too.
      expect(post).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    });

    test('Hands the proposal over once, however many times the button is clicked', async () => {
      setup(medplum);
      await fillBooking();
      await clickBook();

      // Every answer stays on screen, because a refusal needs them; the button is
      // what keeps that from booking the same time a second time.
      expect(bookButton()).toBeDisabled();
      await clickBook();
      expect(onBook).toHaveBeenCalledTimes(1);
    });

    test('Offers to book again once the patient changes', async () => {
      setup(medplum);
      await fillBooking();
      await clickBook();
      expect(bookButton()).toBeDisabled();

      await removePill('Jordan Reyes');
      await choosePatient('Jordan', patientDetail(YoungerJordanPatient));

      // The other Jordan is a different visit, not the one already written.
      expect(bookButton()).toBeEnabled();
    });

    test('Offers to book again once the time changes', async () => {
      setup(medplum);
      await fillBooking();
      await clickBook();
      expect(bookButton()).toBeDisabled();

      await chooseSecondOfferedTime();

      expect(bookButton()).toBeEnabled();
    });

    test('Shows a refused booking and keeps every answer', async () => {
      // A rejection is the refusal, wherever the write was attempted.
      onBook.mockRejectedValue(new Error('Slot is no longer available'));
      setup(medplum);
      await fillBooking();
      const time = (chosenTimeField() as HTMLInputElement).value;
      await clickBook();

      expect(await screen.findByText('Slot is no longer available')).toBeInTheDocument();
      // A refusal is usually somebody else taking the time, and the next attempt
      // is one field away.
      expect(chosenTimeField()?.value).toBe(time);
      expect(screen.getByText('Jordan Reyes')).toBeInTheDocument();
      expect(bookButton()).toBeEnabled();
    });
  });

  /**
   * A form wired the way a project that imported its code value sets wires one.
   * @param props - Anything to set beyond the two bindings.
   */
  function setupWithCodeValueSets(props?: Partial<AppointmentProposalFormProps>): void {
    setup(medplum, { procedureBinding: PROCEDURE_VALUE_SET, diagnosisBinding: DIAGNOSIS_VALUE_SET, ...props });
  }

  describe('Codes a designated visit type cannot be booked without', () => {
    test('Asks for nothing extra for a visit type the practice did not designate', async () => {
      setupWithCodeValueSets();
      await chooseImagingService();

      expect(screen.queryByRole('searchbox', { name: /procedure code/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('searchbox', { name: /diagnosis code/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: /medical necessity/i })).not.toBeInTheDocument();
    });

    test('Asks for the codes once a designated visit type is chosen', async () => {
      setupWithCodeValueSets();
      await chooseAuthorizedService();

      expect(field(/procedure code/i)).toBeInTheDocument();
      expect(field(/diagnosis code/i)).toBeInTheDocument();

      // Required like the two code fields, since nothing here is optional once a practice
      // designated the visit type.
      expect(medicalNecessityBox()).toBeRequired();
    });

    test('Asks for them after the patient, as the last of the visit details', async () => {
      setupWithCodeValueSets();
      await chooseAuthorizedService();

      expect(isBefore(field(/patient/i), field(/procedure code/i))).toBe(true);
      expect(isBefore(field(/procedure code/i), field(/diagnosis code/i))).toBe(true);
    });

    test('Will not book until both codes are given and medical necessity is confirmed', async () => {
      setupWithCodeValueSets();
      await fillAuthorizedBooking();

      // Everything else a booking needs has been answered, so these fields are what is left.
      expect(bookButton()).toBeDisabled();

      await enterCode(/procedure code/i, ProcedureCodes[0]);
      expect(bookButton()).toBeDisabled();

      await enterCode(/diagnosis code/i, DiagnosisCodes[0]);
      expect(bookButton()).toBeDisabled();

      await confirmMedicalNecessity();
      expect(bookButton()).toBeEnabled();
    });

    test('Does not book when the action is clicked while an authorization field is unanswered', async () => {
      setupWithCodeValueSets();
      await fillAuthorizedBooking();
      await clickBook();

      expect(onBook).not.toHaveBeenCalled();
    });

    test('Writes the diagnosis as a reason and the procedure as a service type', async () => {
      setupWithCodeValueSets();
      await fillAuthorizedBooking();
      await enterAuthorizationDetails();
      await clickBook();

      const proposal = proposedAppointment();
      expect(proposal.reasonCode).toEqual([{ coding: [DiagnosisCodes[0]] }]);

      // Appended after the concept `$find` put there naming the visit type, which booking leaves alone.
      expect(proposal.serviceType?.slice(1)).toEqual([{ coding: [ProcedureCodes[0]] }]);

      // A procedure concept carries no service reference, so the appointment still names exactly one
      // visit type. That is what `serviceTypeIncludesService` reads to match a schedule to a service,
      // and a procedure code answering to it would be read as a visit type of its own.
      expect(extractServiceTypeReferences(proposal.serviceType)).toEqual([
        { reference: `HealthcareService/${InfusionService.id}` },
      ]);
    });

    test("Records each code under the value set's own system rather than a guessed one", async () => {
      setupWithCodeValueSets();
      await fillAuthorizedBooking();
      await enterAuthorizationDetails();
      await clickBook();

      // The fixture's diagnoses are ICD-10-CM, which is what a US practice bills under, and not the
      // plain ICD-10 that a field guessing at its own system would have written. What the value set
      // said is the only thing that knows.
      const proposal = proposedAppointment();
      expect(proposal.reasonCode?.[0]?.coding?.[0]?.system).toBe('http://hl7.org/fhir/sid/icd-10-cm');
      expect(proposal.serviceType?.at(-1)?.coding?.[0]?.system).toBe(CPT);
    });

    test('Records that medical necessity was confirmed', async () => {
      setupWithCodeValueSets();
      await fillAuthorizedBooking();
      await enterAuthorizationDetails();
      await clickBook();

      expect(getExtensionValue(proposedAppointment(), SchedulingMedicalNecessityURI)).toBe(true);
    });

    test('Blocks booking again when medical necessity is unticked', async () => {
      setupWithCodeValueSets();
      await fillAuthorizedBooking();
      await enterAuthorizationDetails();
      expect(bookButton()).toBeEnabled();

      await confirmMedicalNecessity();

      expect(bookButton()).toBeDisabled();
    });

    test('Writes no codes for a visit type that was never asked for any', async () => {
      setupWithCodeValueSets();
      await fillBooking();
      await clickBook();

      const proposal = proposedAppointment();
      expect(proposal.reasonCode).toBeUndefined();
      // Just the concept `$find` put there naming the visit type: nothing was appended to it.
      expect(proposal.serviceType).toHaveLength(1);
      expect(getExtensionValue(proposal, SchedulingMedicalNecessityURI)).toBeUndefined();
    });

    test('Shows each code alongside its description, not the description alone', async () => {
      setupWithCodeValueSets();
      await chooseAuthorizedService();

      const listbox = await searchField(/procedure code/i, '96365');

      // The code is the part a scheduler and a biller work in, and two infusion codes can share
      // most of a description, so offering the description alone would not tell them apart.
      expect(within(listbox).getByText('96365')).toBeInTheDocument();
      expect(within(listbox).getByText(ProcedureCodes[0].display as string)).toBeInTheDocument();

      // The system is the same for every row, so it is a url repeated down the list and nothing more.
      expect(within(listbox).queryByText(new RegExp(CPT))).not.toBeInTheDocument();
    });

    test('Takes only codes its value set offered, never one typed over the top', async () => {
      setupWithCodeValueSets();
      await chooseAuthorizedService();

      await typeInAutocomplete(field(/procedure code/i), '43644');

      // No "+ Create" option: a code nobody's value set carries is not a code this can book against,
      // and free text would defeat capturing these discretely in the first place.
      expect(screen.queryByText(/\+ Create/)).not.toBeInTheDocument();
    });

    test('Cannot book a designated visit type when its value sets were never imported', async () => {
      // The cost of taking only what a value set offers: there is nothing to fall back to, so a
      // project that imported neither cannot book the visit types that need them at all. Loud, and
      // deliberately so, since the quiet alternative is booking authorization-gated visits on free text.
      restoreValueSets();
      restoreValueSets = installValueSetStub(medplum, {});
      setupWithCodeValueSets();
      await fillAuthorizedBooking();

      // Both code fields take themselves out of use and say why, rather than sitting there uncompletable.
      expect(screen.getAllByText('This field is unavailable.')).toHaveLength(2);
      expect(screen.queryByRole('searchbox', { name: /procedure code/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('searchbox', { name: /diagnosis code/i })).not.toBeInTheDocument();
      expect(bookButton()).toBeDisabled();
    });

    test('Drops the answers when the visit type changes, and asks again', async () => {
      setupWithCodeValueSets();
      await chooseAuthorizedService();
      await enterAuthorizationDetails();

      // Asserted before the change too, so this cannot pass by looking for a code nothing offers.
      expect(hasPill(codePill(ProcedureCodes[0]))).toBe(true);
      expect(hasPill(codePill(DiagnosisCodes[0]))).toBe(true);
      expect(medicalNecessityBox()).toBeChecked();

      await removePill('Infusion Therapy');
      await chooseAuthorizedService();

      // The code fields keep their own value once mounted, so this is what proves they were
      // remounted rather than merely cleared behind the scenes.
      expect(hasPill(codePill(ProcedureCodes[0]))).toBe(false);
      expect(hasPill(codePill(DiagnosisCodes[0]))).toBe(false);
      expect(medicalNecessityBox()).not.toBeChecked();
    });

    test('Takes the codes away when the visit type no longer needs them', async () => {
      setupWithCodeValueSets();
      await chooseAuthorizedService();
      await removePill('Infusion Therapy');
      await chooseImagingService();

      expect(screen.queryByRole('searchbox', { name: /procedure code/i })).not.toBeInTheDocument();
    });

    test('Offers to book again after a code changes, since that changes what is written', async () => {
      setupWithCodeValueSets();
      await fillAuthorizedBooking();
      await enterAuthorizationDetails();
      await clickBook();
      expect(bookButton()).toBeDisabled();

      await enterCode(/procedure code/i, ProcedureCodes[1]);

      expect(bookButton()).toBeEnabled();
    });

    test('Blocks booking again when the last code in a field is taken back out', async () => {
      setupWithCodeValueSets();
      await fillAuthorizedBooking();
      await enterAuthorizationDetails();
      expect(bookButton()).toBeEnabled();

      await removePill(codePill(ProcedureCodes[0]));

      expect(bookButton()).toBeDisabled();
    });

    test('Takes more than one of each code', async () => {
      setupWithCodeValueSets();
      await fillAuthorizedBooking();
      await enterAuthorizationDetails();

      await enterCode(/procedure code/i, ProcedureCodes[1]);
      await enterCode(/diagnosis code/i, DiagnosisCodes[1]);
      await clickBook();

      // One entry of `reasonCode` per diagnosis: an element there is one reason, and codings inside
      // one element would be that same reason said again in another system.
      const proposal = proposedAppointment();
      expect(proposal.reasonCode).toEqual([{ coding: [DiagnosisCodes[0]] }, { coding: [DiagnosisCodes[1]] }]);

      // One `serviceType` concept per procedure, for the same reason: two codings inside one concept
      // would be one procedure encoded twice rather than two procedures.
      expect(proposal.serviceType?.slice(1)).toEqual([
        { coding: [ProcedureCodes[0]] },
        { coding: [ProcedureCodes[1]] },
      ]);
    });

    test('Still books on one of each, so the second code is never owed', async () => {
      setupWithCodeValueSets();
      await fillAuthorizedBooking();
      await enterAuthorizationDetails();

      expect(bookButton()).toBeEnabled();
      await clickBook();

      expect(proposedAppointment().reasonCode).toHaveLength(1);
    });
  });
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Device } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { JSX } from 'react';
import { installFindStub } from '../stories/mockFind';
import {
  MainClinic,
  SatelliteClinic,
  SchedulingFixtures,
  SubClinicProviderFixtures,
  SurgeryService,
  SurgicalFixtures,
  TelehealthService,
  Ultrasound1Device,
  UltrasoundImagingService,
} from '../stories/scheduling';
import {
  clickAutocompleteOption,
  installAutocompleteTimers,
  settleAutocomplete,
  typeInAutocomplete,
} from '../test-utils/asyncAutocomplete';
import { stubChainedActorSearch } from '../test-utils/chainedActorSearch';
import { act, fireEvent, renderWithMedplum, screen, waitFor, within } from '../test-utils/render';
import type { AppointmentBookingFormProps } from './AppointmentBookingForm';
import { AppointmentBookingForm } from './AppointmentBookingForm';

/**
 * A Monday morning, so the stubbed `$find` has weekday hours ahead of it on the
 * day the form searches by default.
 */
const MONDAY_MORNING = new Date(2026, 7, 17, 8, 0, 0);

/** The timezone the fixtures' visit type is held in, which is not the runner's. */
const SITE_TIMEZONE = 'America/New_York';

installAutocompleteTimers();

async function setupClient(): Promise<MockClient> {
  const medplum = new MockClient();
  for (const resource of [...SchedulingFixtures, ...SurgicalFixtures, ...SubClinicProviderFixtures]) {
    await medplum.createResource(resource);
  }
  stubChainedActorSearch(medplum);
  return medplum;
}

function setup(medplum: MockClient, props?: AppointmentBookingFormProps): void {
  const element: JSX.Element = <AppointmentBookingForm {...props} />;
  renderWithMedplum(element, medplum);
}

/**
 * The search box for one of the form's fields.
 * @param label - Matches the label above the field.
 * @returns The field's search box.
 */
function field(label: RegExp): HTMLElement {
  return screen.getByRole('searchbox', { name: label });
}

/** Chooses the imaging service, which is what the role fields search against. */
async function chooseImagingService(): Promise<void> {
  await typeInAutocomplete(field(/visit type/i), 'Ultrasound');
  await clickAutocompleteOption('Ultrasound Imaging');
  await settleAutocomplete();
}

/**
 * Opens one role's field on everything it has, without typing a name.
 *
 * `fireEvent.change` to the value already in the box is not a change, so the
 * unfiltered list is reached the way a user reaches it: by focusing.
 *
 * @param role - The field to open.
 * @returns The field's search box.
 */
async function openRoleField(role: RegExp): Promise<HTMLElement> {
  const input = field(role);
  await act(async () => {
    fireEvent.focus(input);
  });
  await settleAutocomplete();
  return input;
}

/**
 * Searches one field and returns the dropdown that field owns.
 *
 * Scoped per field: several autocompletes are on screen at once and a dropdown stays
 * in the document once opened, so an unscoped query could read — or click — an option
 * belonging to another field.
 *
 * @param label - Matches the label above the field.
 * @param query - What to type, which is what the search narrows on.
 * @returns The field's dropdown.
 */
async function searchField(label: RegExp, query: string): Promise<HTMLElement> {
  const input = field(label);
  await typeInAutocomplete(input, query);

  const listboxId = input.getAttribute('aria-controls');
  const listbox = listboxId && document.getElementById(listboxId);
  if (!listbox) {
    throw new Error(`No dropdown found for ${label.source}`);
  }
  return listbox;
}

/**
 * Names an actor for one role.
 * @param role - The field to choose in.
 * @param query - What to type, which is what the search narrows on.
 * @param name - The actor to choose out of what came back.
 */
async function chooseActor(role: RegExp, query: string, name: string): Promise<void> {
  const listbox = await searchField(role, query);
  await act(async () => {
    fireEvent.click(within(listbox).getByText(name));
  });
  await settleAutocomplete();
}

/**
 * Empties the visit type field, which is the only way to change what it holds:
 * it takes one value at most, so its search box is gone while it is full.
 *
 * @param name - The visit type currently chosen.
 */
async function clearVisitType(name: string): Promise<void> {
  // Mantine's remove button is `aria-hidden`, so it is reached through the pill
  // it sits in rather than by its role.
  const remove = screen.getByText(name).parentElement?.querySelector('button');
  if (!remove) {
    throw new Error(`No remove button on the ${name} pill`);
  }
  await act(async () => {
    fireEvent.click(remove);
  });
  await settleAutocomplete();
}

/**
 * Chooses a site in the location field.
 *
 * Starts from an empty field: like the visit type, it holds one value and takes
 * its search box away while full.
 *
 * @param query - What to type.
 * @param name - The site to click out of what came back.
 */
async function chooseSite(query: string, name: string): Promise<void> {
  const listbox = await searchField(/location/i, query);
  // By name, not by position: a search narrow enough to return one site is a
  // search narrow enough to pass while offering the wrong one.
  await act(async () => {
    fireEvent.click(within(listbox).getByText(name));
  });
  await settleAutocomplete();
}

/** Opens the time search, which is what sends the `$find` request. */
async function openTimeFinder(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /find a time/i }));
  });
  await settleAutocomplete();
}

/**
 * Clicks a day in the time search's calendar.
 * @param dayOfMonth - The day's number, which is what the cell is labelled with.
 */
async function chooseDay(dayOfMonth: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: dayOfMonth }));
  });
  await settleAutocomplete();
}

/**
 * Picks the first time on offer.
 *
 * Times are read at the site, whose timezone is not the runner's, so the time is
 * picked by position rather than by the clock face it shows.
 *
 * @returns The label of the time that was picked.
 */
async function chooseFirstOfferedTime(): Promise<string> {
  const [firstGroup] = await screen.findAllByTestId(/^slot-group-/);
  const [firstTime] = within(firstGroup).getAllByRole('button');
  const label = firstTime.textContent ?? '';
  await act(async () => {
    fireEvent.click(firstTime);
  });
  return label;
}

/**
 * Whether a field is holding a value, read off the pill rather than the state.
 *
 * The pill is what went stale: the fields keep their own selection and ignore
 * `defaultValue` after mount, so a cleared form could still show one.
 *
 * @param name - The value's label.
 * @returns Whether a pill is showing it.
 */
function hasPill(name: string): boolean {
  return screen.queryAllByText(name).some((node) => node.className.includes('Pill'));
}

/**
 * The field holding the chosen time, or null while no time has been chosen.
 *
 * There is no field at all before a time is picked, so its absence is an assertion
 * in its own right rather than an empty value to read.
 *
 * @returns The field, or null.
 */
function chosenTimeField(): HTMLInputElement | null {
  return screen.queryByRole<HTMLInputElement>('textbox', { name: /date & time/i });
}

/**
 * Whether one element comes before another in the document.
 *
 * Where the chosen time sits is part of the behaviour: the form is a column of
 * labelled fields and the answer belongs above the control that produced it, which
 * only document order carries.
 *
 * @param first - The element expected to come first.
 * @param second - The element expected to follow it.
 * @returns Whether they are in that order.
 */
function isBefore(first: Element, second: Element): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/**
 * The action that finds a time, whatever it currently offers to do.
 * @returns The button.
 */
function finderButton(): HTMLElement {
  return screen.getByRole('button', { name: /find a time|change time|close time finder/i });
}

describe('AppointmentBookingForm', () => {
  let medplum: MockClient;
  let restoreFind: () => void;

  beforeEach(async () => {
    vi.setSystemTime(MONDAY_MORNING);
    medplum = await setupClient();
    restoreFind = installFindStub(medplum);
  });

  afterEach(() => {
    restoreFind();
  });

  describe('Choosing the resources a visit is held on', () => {
    test('Offers a field for all three roles', async () => {
      setup(medplum);
      await chooseImagingService();

      // All three render whatever the visit type has configured, so the form's
      // shape does not change with the data behind it.
      expect(field(/provider/i)).toBeInTheDocument();
      expect(field(/room/i)).toBeInTheDocument();
      expect(field(/device/i)).toBeInTheDocument();
    });

    test('Offers nothing to type into until a visit type is chosen', async () => {
      setup(medplum);
      await settleAutocomplete();

      // Searching before a visit type is chosen could only find nothing.
      for (const role of [/^Provider$/, /^Room$/, /^Device$/]) {
        expect(screen.queryByRole('searchbox', { name: role })).not.toBeInTheDocument();
        expect(screen.getByText(role)).toBeInTheDocument();
      }

      await chooseImagingService();

      expect(field(/provider/i)).toBeInTheDocument();
    });

    test('Searches no times until a provider is named', async () => {
      setup(medplum);
      await chooseImagingService();

      // A room alone is not enough: it would hold the room while leaving the
      // calendar it is booked against open.
      await chooseActor(/room/i, 'exam', 'Exam Room A');
      await openTimeFinder();

      expect(screen.getByText('Choose at least one provider')).toBeInTheDocument();
      expect(screen.queryAllByTestId(/^slot-group-/)).toHaveLength(0);
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

      // A role with nothing configured is a search that finds nothing, not a
      // missing field.
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

      // One request over both schedules: `$find` intersects what it is given, so
      // the times come back as a single set both are free for rather than two.
      const groups = await screen.findAllByTestId(/^slot-group-/);
      expect(groups).toHaveLength(1);
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
      // Dr. Martinez's role names the main clinic itself, which is the only way a
      // provider is sited.
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

      // The devices record no location, and hiding something the caller may be
      // entitled to book is worse than offering something at the wrong site.
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

      // Unscoped: a search that came back with nothing leaves no dropdown to scope
      // to, and only a field that has been searched shows an empty message at all.
      await typeInAutocomplete(field(/location/i), 'Exam Room A');

      // Rooms and beds are Locations; nothing but their physical type keeps them out.
      expect(await screen.findByText('Nothing found')).toBeInTheDocument();
      expect(screen.queryByText('Exam Room A')).not.toBeInTheDocument();
      expect(screen.queryByText('Exam Room A Bed 1')).not.toBeInTheDocument();
    });

    test('Offers a Location that records no physical type', async () => {
      setup(medplum);

      const listbox = await searchField(/location/i, 'Uro Associates');

      // Neither clinic declares a physical type, and nothing requires one: the field
      // excludes what says it is a room, rather than admitting only what says site.
      expect(within(listbox).getByText('Uro Associates - Main Clinic')).toBeInTheDocument();
      expect(within(listbox).getByText('Uro Associates - Satellite')).toBeInTheDocument();
    });

    test('Narrows the visit types to the chosen site, and says which site', async () => {
      setup(medplum);
      await chooseSite('Satellite', 'Uro Associates - Satellite');

      await typeInAutocomplete(field(/visit type/i), 'Ultrasound');

      expect(screen.getByText('Showing visit types offered at Uro Associates - Satellite.')).toBeInTheDocument();
      // Imaging names the main clinic, and only a visit type naming this site
      // exactly is offered at it.
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
      expect(groups).toHaveLength(1);
      expect(within(groups[0]).getByText('Dr. Maya Rivera')).toBeInTheDocument();
      expect(within(groups[0]).getByText('Exam Room A')).toBeInTheDocument();
    });

    test('Issues no request until the time search is opened', async () => {
      const get = vi.spyOn(medplum, 'get');
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');

      // Everything the search needs has been answered, and still nothing is
      // asked for: the times depend on every answer above them.
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
  });

  describe('Reading times in the site’s timezone', () => {
    test('Shows an offered time as the time at the site', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();

      const [group] = await screen.findAllByTestId(/^slot-group-/);
      const [firstTime] = within(group).getAllByRole('button');
      // The stub lays times on the clinic's open hours in the runner's timezone,
      // so the label is that instant read at the site rather than 9:00 repeated.
      const start = new Date(2026, 7, 17, 9, 0, 0);

      expect(firstTime).toHaveTextContent(
        new Intl.DateTimeFormat(undefined, {
          timeZone: SITE_TIMEZONE,
          hour: 'numeric',
          minute: '2-digit',
        }).format(start)
      );
    });

    test('Records the instant the site-local time stands for', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      const label = await chooseFirstOfferedTime();

      // The chosen time is the server's own proposal, so its instant is what a
      // booking would record.
      expect(chosenTimeField()?.value).toContain(label);
    });
  });

  describe('Booking only a time that was offered', () => {
    test('Shows nothing standing in for a time before one is chosen', async () => {
      setup(medplum);
      await chooseImagingService();

      // By name rather than by there being no text field at all, since the form has
      // other ones to grow.
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
      // Above the action, so the form stays one column of labelled answers rather
      // than putting one below the control that produced it.
      expect(isBefore(chosen, finderButton())).toBe(true);
      // Off the proposal, so what the field commits to is what `$book` would be
      // handed. Roles named, since the field is read away from their own fields.
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

      // Nothing can be booked onto time nobody checked availability for, so the
      // field only ever displays.
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

      // Repeating "Find a time" over a time that was found reads as though the
      // search had come back with nothing.
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

      // The field goes with the time rather than staying behind as an empty one.
      expect(chosenTimeField()).not.toBeInTheDocument();
    });
  });

  describe('Clearing answers that depended on the visit type', () => {
    test('Clears the chosen resources and time when the visit type changes', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await chooseFirstOfferedTime();
      expect(chosenTimeField()).toBeInTheDocument();

      await clearVisitType('Ultrasound Imaging');
      await typeInAutocomplete(field(/visit type/i), 'Bariatric');
      await clickAutocompleteOption('Bariatric Surgery');
      await settleAutocomplete();

      expect(chosenTimeField()).not.toBeInTheDocument();
      // Not just the state: a surviving pill is handed back on the next pick, and
      // searched against a schedule the new visit type cannot book.
      expect(hasPill('Dr. Maya Rivera')).toBe(false);
    });

    test('Clears the chosen resources when the site changes', async () => {
      setup(medplum, { defaultService: UltrasoundImagingService });
      await settleAutocomplete();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      expect(hasPill('Dr. Maya Rivera')).toBe(true);

      await chooseSite('Main Clinic', 'Uro Associates - Main Clinic');

      // The site decides which actors are offered at all.
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

    test('Keeps a visit type that names no location when the site changes', async () => {
      setup(medplum, { defaultService: TelehealthService });
      await settleAutocomplete();
      expect(hasPill('Telehealth Consult')).toBe(true);

      await chooseSite('Main Clinic', 'Uro Associates - Main Clinic');

      // Never tied to a site, so no site can invalidate it — even though choosing one
      // now keeps it from being offered again.
      expect(hasPill('Telehealth Consult')).toBe(true);
    });

    test('Collapses the time search when the visit type is cleared, and says so', async () => {
      const onToggleTimeFinder = vi.fn();
      setup(medplum, { onToggleTimeFinder });
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await screen.findAllByTestId(/^slot-group-/);

      await clearVisitType('Ultrasound Imaging');

      // Nothing can be searched without a visit type, and the host has to be told
      // so the panel it widened narrows again.
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
    test('Reports the time search opening and closing', async () => {
      const onToggleTimeFinder = vi.fn();
      setup(medplum, { onToggleTimeFinder });
      await chooseImagingService();

      await openTimeFinder();
      expect(onToggleTimeFinder).toHaveBeenLastCalledWith(true);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /close time finder/i }));
      });
      expect(onToggleTimeFinder).toHaveBeenLastCalledWith(false);
    });

    test('Opens the time search on the day the host named', async () => {
      // A Wednesday in the following month, so neither today nor the month the
      // calendar would otherwise open on could pass this by accident.
      setup(medplum, { defaultService: UltrasoundImagingService, defaultStart: new Date(2026, 8, 2, 0, 0, 0) });
      await settleAutocomplete();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();

      expect(await screen.findByText(/Wednesday, September 2/)).toBeInTheDocument();
    });
  });
});

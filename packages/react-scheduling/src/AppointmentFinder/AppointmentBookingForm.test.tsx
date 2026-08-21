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

/** A Monday, so the stub has weekday hours ahead of it on the default search day. */
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

function field(label: RegExp): HTMLElement {
  return screen.getByRole('searchbox', { name: label });
}

async function chooseImagingService(): Promise<void> {
  await typeInAutocomplete(field(/visit type/i), 'Ultrasound');
  await clickAutocompleteOption('Ultrasound Imaging');
  await settleAutocomplete();
}

/**
 * Opens one role's field on everything it has, by focusing: `fireEvent.change` to the
 * value already in the box is not a change.
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
 * Several autocompletes are on screen at once and a dropdown stays in the document
 * once opened, so an unscoped query could read — or click — another field's option.
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

async function chooseActor(role: RegExp, query: string, name: string): Promise<void> {
  const listbox = await searchField(role, query);
  await act(async () => {
    fireEvent.click(within(listbox).getByText(name));
  });
  await settleAutocomplete();
}

/**
 * Takes one chosen value back out of the field holding it: the only way to change the
 * visit type, which takes its search box away while full.
 *
 * @param name - The value currently chosen.
 */
async function removePill(name: string): Promise<void> {
  // Scoped to the pill, since a named resource is also on the slot card and in the
  // chosen time's description. Mantine's remove button is `aria-hidden`.
  const pill = screen.queryAllByText(name).find((node) => node.className.includes('Pill'));
  const remove = pill?.parentElement?.querySelector('button');
  if (!remove) {
    throw new Error(`No remove button on the ${name} pill`);
  }
  await act(async () => {
    fireEvent.click(remove);
  });
  await settleAutocomplete();
}

/**
 * Chooses a site in the location field, which holds one value at a time.
 * @param query - What to type.
 * @param name - The site to click out of what came back.
 */
async function chooseSite(query: string, name: string): Promise<void> {
  const listbox = await searchField(/location/i, query);
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
 * @param dayOfMonth - The number the cell is labelled with.
 */
async function chooseDay(dayOfMonth: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: dayOfMonth }));
  });
  await settleAutocomplete();
}

/**
 * Picks the first time on offer, by position: times are read at the site, whose
 * timezone is not the runner's.
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
 * Whether a field is holding a value, read off the pill rather than the state: the
 * fields ignore `defaultValue` after mount, so a cleared form could still show one.
 *
 * @param name - The value's label.
 * @returns Whether a pill is showing it.
 */
function hasPill(name: string): boolean {
  return screen.queryAllByText(name).some((node) => node.className.includes('Pill'));
}

/**
 * The field holding the chosen time, or null while no time has been chosen — there is
 * no field at all before one is picked, so its absence is an assertion of its own.
 *
 * @returns The field, or null.
 */
function chosenTimeField(): HTMLInputElement | null {
  return screen.queryByRole<HTMLInputElement>('textbox', { name: /date & time/i });
}

/**
 * Whether one element comes before another in the document, which is the only thing
 * carrying where the chosen time sits relative to the action.
 *
 * @param first - The element expected to come first.
 * @param second - The element expected to follow it.
 * @returns Whether they are in that order.
 */
function isBefore(first: Element, second: Element): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/**
 * The action that finds a time, under whichever of its three labels.
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

      // One group, not two: `$find` intersects the schedules it is given.
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

      expect(screen.getByText('Showing visit types offered at Uro Associates - Satellite.')).toBeInTheDocument();
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
      expect(groups).toHaveLength(1);
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
        }).format(start)
      );
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

    test('Keeps a visit type that names no location when the site changes', async () => {
      setup(medplum, { defaultService: TelehealthService });
      await settleAutocomplete();
      expect(hasPill('Telehealth Consult')).toBe(true);

      await chooseSite('Main Clinic', 'Uro Associates - Main Clinic');

      // Never tied to a site, so no site invalidates it — even though choosing one now
      // keeps it from being offered again.
      expect(hasPill('Telehealth Consult')).toBe(true);
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

    test('Opens the time search on the day the host named', async () => {
      // In the following month, so the month the calendar would otherwise open on
      // cannot pass this by accident.
      setup(medplum, { defaultService: UltrasoundImagingService, defaultStart: new Date(2026, 8, 2, 0, 0, 0) });
      await settleAutocomplete();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();

      expect(await screen.findByText(/Wednesday, September 2/)).toBeInTheDocument();
    });
  });
});

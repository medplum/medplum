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
  await typeInAutocomplete(field(/service type/i), 'Ultrasound');
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
 * Names an actor for one role.
 *
 * The pick is scoped to the dropdown this field owns: three role fields are on
 * screen at once and a dropdown stays in the document once it has been opened,
 * so an unscoped search could click an option belonging to another field.
 *
 * @param role - The field to choose in.
 * @param query - What to type, which is what the search narrows on.
 * @param name - The actor to choose out of what came back.
 */
async function chooseActor(role: RegExp, query: string, name: string): Promise<void> {
  const input = field(role);
  await typeInAutocomplete(input, query);

  const listboxId = input.getAttribute('aria-controls');
  const listbox = listboxId && document.getElementById(listboxId);
  if (!listbox) {
    throw new Error(`No dropdown found for ${role.source}`);
  }
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
 * The read-only field the chosen time is shown in.
 * @returns The field.
 */
function chosenTimeField(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>('textbox', { name: /date & time/i });
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

      // A name the visit type has never heard of finds nothing, and the field
      // says so rather than disappearing.
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
      // Dr. Martinez's practitioner role names the main clinic itself, which is
      // the only way a provider is sited: there is no walk up the chain.
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
      // The asymmetry a reader is most likely to take for a bug: a room is sited
      // by walking `partOf`, a provider only by a role naming the site exactly.
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

      // The chosen time is the server's own proposal, so the instant it carries
      // is what a booking would record, and the field reads it at the site.
      expect(chosenTimeField().value).toContain(label);
    });
  });

  describe('Booking only a time that was offered', () => {
    test('Shows the time that was picked', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();

      expect(chosenTimeField().value).toBe('');
      const label = await chooseFirstOfferedTime();

      expect(chosenTimeField().value).toContain(label);
    });

    test('Refuses a time typed into the field', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await chooseFirstOfferedTime();
      const shown = chosenTimeField().value;

      await act(async () => {
        fireEvent.change(chosenTimeField(), { target: { value: 'Monday, August 17 at 11:59 PM' } });
      });

      // Nothing can be booked onto time that was never checked against
      // anybody's availability, so the field only ever displays.
      expect(chosenTimeField()).toHaveAttribute('readonly');
      expect(chosenTimeField().value).toBe(shown);
    });

    test('Clears the chosen time when the day changes', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await chooseFirstOfferedTime();

      await chooseDay('18');

      expect(chosenTimeField().value).toBe('');
    });
  });

  describe('Clearing answers that depended on the visit type', () => {
    test('Clears the chosen resources and time when the visit type changes', async () => {
      setup(medplum);
      await chooseImagingService();
      await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
      await openTimeFinder();
      await chooseFirstOfferedTime();
      expect(chosenTimeField().value).not.toBe('');

      await clearVisitType('Ultrasound Imaging');
      await typeInAutocomplete(field(/service type/i), 'Bariatric');
      await clickAutocompleteOption('Bariatric Surgery');
      await settleAutocomplete();

      // The actors on offer come from the visit type, so what was chosen for the
      // last one cannot mean anything for this one — nor can a time held on them.
      expect(chosenTimeField().value).toBe('');
      expect(screen.getByText('Choose at least one provider')).toBeInTheDocument();
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

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_THEME } from '@mantine/core';
import { SchedulingColorURI } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { SinonFakeTimers } from 'sinon';
import { useFakeTimers } from 'sinon';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { BOOKABLE_ACTOR_TYPES } from '../actors';
import { CalendarWeekFixtures, SatelliteClinic, SchedulingFixtures, TelehealthService } from '../stories/scheduling';
import { pillRemoveButton } from '../test-utils/asyncAutocomplete';
import { act, renderWithMedplum, screen, userEvent, waitFor, within } from '../test-utils/render';
import { SchedulingWorkspace } from './SchedulingWorkspace';

/**
 * Picks an option from one of the two filter typeaheads, as a user does: click the field,
 * wait for the options the empty search brings back, click one.
 *
 * Real timers throughout — the workspace's own fetches settle on them, and the field's
 * debounce is short enough for `findBy` to outwait.
 *
 * @param placeholder - The field's placeholder, which is what it reads as when unfiltered.
 * @param option - The option's label.
 */
async function chooseFilter(placeholder: string, option: string | RegExp): Promise<void> {
  await userEvent.click(screen.getByPlaceholderText(placeholder));
  // Scoped to the dropdown, since the calendar's events are titled with the visit type too.
  await userEvent.click(await within(await screen.findByRole('listbox')).findByText(option));
}

/**
 * Takes a filter back to matching everything, the one way there is: the pill's own
 * remove button, which Mantine leaves aria-hidden and out of the tab order. Tracked
 * as an accessibility gap in https://github.com/medplum/medplum/issues/10609.
 *
 * @param name - The value the filter is currently on.
 */
async function clearFilter(name: string): Promise<void> {
  await userEvent.click(pillRemoveButton(name));
}

async function setupClient(resources: readonly Resource[] = SchedulingFixtures): Promise<MockClient> {
  const medplum = new MockClient();
  for (const resource of resources) {
    await medplum.createResource(resource);
  }
  return medplum;
}

/**
 * A calendar's row in the sidebar, picked out from the slots on the calendar, which name whose
 * time they hold too.
 *
 * @param label - The calendar's row label.
 * @returns The row's button.
 */
function calendarRow(label: string): HTMLElement {
  const row = screen
    .getAllByText(label)
    .map((element) => element.closest('button'))
    .find(Boolean);
  if (!row) {
    throw new Error(`No sidebar row for ${label}`);
  }
  return row;
}

const FILTERED_NOTICE = 'The calendar filters hide this appointment.';

/**
 * The appointment events on the calendar for a patient.
 *
 * @param patient - The patient's name, which is what an appointment event is titled.
 * @returns The events.
 */
function appointmentEvents(patient: string): Element[] {
  return [...document.querySelectorAll('.appointment')].filter((event) => event.textContent?.includes(patient));
}

/**
 * The color a patient's one appointment event is drawn in.
 *
 * @param patient - The patient's name.
 * @returns The color FullCalendar was handed.
 */
function eventColor(patient: string): string | undefined {
  return (appointmentEvents(patient)[0] as HTMLElement | undefined)?.style.getPropertyValue('--fc-event-color');
}

/**
 * The color a service type is keyed in, in the legend below the calendar.
 *
 * @param label - The service type's name.
 * @returns The color its swatch shows, as FullCalendar is handed an event's color.
 */
async function serviceTypeColor(label: string): Promise<string | undefined> {
  await userEvent.hover(screen.getByRole('button', { name: 'Legend' }));
  const row = (await within(await screen.findByRole('dialog')).findByText(label)).closest('.mantine-Group-root');
  const color = /--mantine-color-([a-z]+)-7/.exec(row?.innerHTML ?? '')?.[1];
  return color && DEFAULT_THEME.colors[color][7];
}

describe('SchedulingWorkspace', () => {
  test('deselecting a provider marks its row inactive', async () => {
    const medplum = await setupClient();
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());
    const providerRow = screen.getByText('Dr. Maya Rivera').closest('button') as HTMLElement;
    expect(providerRow).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(providerRow);

    expect(providerRow).toHaveAttribute('aria-pressed', 'false');
  });

  test('deselecting a device marks its row inactive', async () => {
    const medplum = await setupClient();
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await waitFor(() => expect(screen.getByText('Ultrasound 1 (Main Campus)')).toBeInTheDocument());
    const deviceRow = screen.getByText('Ultrasound 1 (Main Campus)').closest('button') as HTMLElement;
    expect(deviceRow).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(deviceRow);

    expect(deviceRow).toHaveAttribute('aria-pressed', 'false');
  });

  test('deselecting a room marks its row inactive', async () => {
    const medplum = await setupClient();
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await waitFor(() => expect(screen.getByText('Exam Room A')).toBeInTheDocument());
    const roomRow = screen.getByText('Exam Room A').closest('button') as HTMLElement;
    expect(roomRow).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(roomRow);

    expect(roomRow).toHaveAttribute('aria-pressed', 'false');
  });

  test('collapsing the sidebar hides it, and expanding it keeps what was deselected', async () => {
    const medplum = await setupClient();
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());
    const providerRow = calendarRow('Dr. Maya Rivera');
    await userEvent.click(providerRow);

    await userEvent.click(screen.getByRole('button', { name: 'Hide calendars' }));
    expect(providerRow).not.toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Show calendars' }));
    expect(providerRow).toBeVisible();
    expect(providerRow).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Show calendars' })).toBeNull();
  });

  test('shows the empty state for sections with no schedules', async () => {
    // A fresh MockClient always seeds its own default provider (Dr. Alice Smith)
    // and its Schedule, but no devices or rooms, so those two sections stay empty
    // without needing any scheduling fixtures.
    const medplum = await setupClient([]);
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await waitFor(() => expect(screen.getByText('No devices found')).toBeInTheDocument());
    expect(screen.getByText('No rooms found')).toBeInTheDocument();
  });

  test('shows an alert when the candidate search fails', async () => {
    const medplum = await setupClient();
    vi.spyOn(medplum, 'search').mockRejectedValue(new Error('Schedule search failed'));

    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await waitFor(() => {
      expect(within(screen.getByRole('alert')).getByText('Schedule search failed')).toBeInTheDocument();
    });
  });

  describe('with CalendarWeekFixtures', () => {
    let clock: SinonFakeTimers | undefined;

    afterEach(() => {
      clock?.restore();
      clock = undefined;
    });

    test('the filters narrow the appointments drawn, and leave every calendar listed', async () => {
      clock = useFakeTimers({ now: new Date(2020, 4, 4, 12, 5), shouldAdvanceTime: false, toFake: ['Date'] });

      const medplum = await setupClient([...SchedulingFixtures, ...CalendarWeekFixtures]);
      renderWithMedplum(<SchedulingWorkspace />, medplum);
      await waitFor(() => expect(appointmentEvents('Liam Jones')).toHaveLength(1));
      expect(appointmentEvents('Miles Cooper')).toHaveLength(1);
      const search = vi.spyOn(medplum, 'search');

      expect(screen.getAllByText('Blocked')).toHaveLength(2);
      await userEvent.click(appointmentEvents('Miles Cooper')[0]);
      const appointmentDetails = screen.getByRole('region', { name: 'Appointment details' });
      expect(within(appointmentDetails).queryByText(FILTERED_NOTICE)).not.toBeInTheDocument();

      // An open appointment the filters hide stays open, saying so.
      await chooseFilter('All visit types', 'Infusion Therapy');
      await waitFor(() => expect(appointmentEvents('Miles Cooper')).toHaveLength(0));
      expect(within(appointmentDetails).getByText(FILTERED_NOTICE)).toBeInTheDocument();

      // Only Dr. Chen's infusion is left, not Jordan Reyes's visit naming no service type, so the
      // one block is the buffer after it: Exam Room A's maintenance goes.
      await waitFor(() => expect(appointmentEvents('Jordan Reyes')).toHaveLength(1));
      expect(appointmentEvents('Liam Jones')).toHaveLength(0);
      await userEvent.click(screen.getByText('Blocked'));
      const details = screen.getByRole('region', { name: 'Blocked time details' });
      expect(within(details).getByText('buffer after appointment')).toBeInTheDocument();
      await userEvent.click(within(details).getByRole('button', { name: 'Close blocked time details' }));
      expect(calendarRow('Dr. Maya Rivera')).toHaveAttribute('aria-pressed', 'true');
      expect(calendarRow('Ultrasound 1 (Main Campus)')).toHaveAttribute('aria-pressed', 'true');

      await clearFilter('Infusion Therapy');
      await waitFor(() => expect(appointmentEvents('Miles Cooper')).toHaveLength(1));
      expect(screen.getAllByText('Blocked')).toHaveLength(2);

      // Liam Jones's visit records no site, so it is not at the main clinic. Dr. Chen's infusion
      // is, so its buffer is the one block left.
      await chooseFilter('All service facilities', 'Uro Associates - Main Clinic');
      await waitFor(() => expect(appointmentEvents('Liam Jones')).toHaveLength(0));
      expect(appointmentEvents('Miles Cooper')).toHaveLength(1);
      expect(screen.getAllByText('Blocked')).toHaveLength(1);
      expect(calendarRow('Dr. Maya Rivera')).toHaveAttribute('aria-pressed', 'true');

      expect(search.mock.calls.filter(([resourceType]) => resourceType === 'Schedule')).toHaveLength(0);
    });

    test.each([
      ['the Location', SatelliteClinic],
      ['a reference to it', { reference: 'Location/satellite-clinic' }],
    ])('started on a site given %s, draws only the appointments held there', async (_, defaultServiceFacility) => {
      clock = useFakeTimers({ now: new Date(2020, 4, 4, 12, 5), shouldAdvanceTime: false, toFake: ['Date'] });

      const medplum = await setupClient([...SchedulingFixtures, ...CalendarWeekFixtures]);
      const search = vi.spyOn(medplum, 'search');
      const searchResources = vi.spyOn(medplum, 'searchResources');
      renderWithMedplum(<SchedulingWorkspace defaultServiceFacility={defaultServiceFacility} />, medplum);

      // The week's appointments have arrived, so none drawn means none is held at the satellite.
      await waitFor(() => expect(searchResources.mock.calls.some(([type]) => type === 'Appointment')).toBe(true));
      await act(() => Promise.all(searchResources.mock.results.map((result) => result.value)));
      expect(screen.getByText('Uro Associates - Satellite')).toBeInTheDocument();
      expect(calendarRow('Exam Room A')).toHaveAttribute('aria-pressed', 'true');
      expect(calendarRow('Satellite Exam Room')).toHaveAttribute('aria-pressed', 'true');
      expect(appointmentEvents('Miles Cooper')).toHaveLength(0);
      expect(search.mock.calls.filter(([resourceType]) => resourceType === 'Schedule')).toHaveLength(
        BOOKABLE_ACTOR_TYPES.length
      );

      // It is only where the filter starts.
      await clearFilter('Uro Associates - Satellite');
      await waitFor(() => expect(appointmentEvents('Miles Cooper')).toHaveLength(1));
      expect(screen.getAllByText('Blocked')).toHaveLength(2);
    });

    test(`shows the fixtures' booked appointments and blocked slots on the pinned "today"`, async () => {
      // The same frozen "today" Storybook's `MockDateWrapper` uses, so `timeGridWeek`
      // renders the same Sun May 3 – Sat May 9 2020 week the fixtures are dated within.
      clock = useFakeTimers({ now: new Date(2020, 4, 4, 12, 5), shouldAdvanceTime: false, toFake: ['Date'] });

      const medplum = await setupClient([...SchedulingFixtures, ...CalendarWeekFixtures]);
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());

      // The calendar's own Slot/Appointment fetch only starts once it reports its visible
      // range and the selected providers/devices/rooms resolve to Schedules, so this
      // settles a little after the sidebar's provider list does. FullCalendar renders
      // each event's title more than once internally, so these use `getAllByText`
      // rather than asserting on a single match.
      await waitFor(() => expect(screen.getAllByText('Miles Cooper').length).toBeGreaterThan(0));
      expect(screen.getAllByText('Renee Alvarez').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);
      // Dr. Rivera's free Slot is not drawn: it would read as the only time open for booking.
      expect(screen.queryByText('Available')).not.toBeInTheDocument();
    });

    test("an appointment is drawn once, in its service type's color, while any of its calendars is on show", async () => {
      clock = useFakeTimers({ now: new Date(2020, 4, 4, 12, 5), shouldAdvanceTime: false, toFake: ['Date'] });

      // Telehealth names its color; imaging is left to the one picked for it.
      const telehealth = {
        ...TelehealthService,
        extension: [...(TelehealthService.extension ?? []), { url: SchedulingColorURI, valueString: 'grape' }],
      };
      const fixtures = SchedulingFixtures.map((resource) => (resource === TelehealthService ? telehealth : resource));
      renderWithMedplum(<SchedulingWorkspace />, await setupClient([...fixtures, ...CalendarWeekFixtures]));

      // Liam Jones's telehealth visit is drawn in grape from the first, never in the color
      // Telehealth would otherwise be given.
      await waitFor(() => expect(appointmentEvents('Liam Jones')).toHaveLength(1));
      expect(eventColor('Liam Jones')).toBe(DEFAULT_THEME.colors.grape[7]);

      // Miles Cooper's visit is held on Dr. Rivera, Ultrasound 1 and Exam Room A, and is
      // still one event, titled and colored by its imaging service type.
      await waitFor(() => expect(appointmentEvents('Miles Cooper')).toHaveLength(1));
      const imaging = eventColor('Miles Cooper');
      await waitFor(() => expect(appointmentEvents('Miles Cooper')[0]).toHaveTextContent('Ultrasound Imaging'));
      // The card marks Dr. Rivera as the visit's primary provider.
      const title = within(appointmentEvents('Miles Cooper')[0] as HTMLElement).getByText('Miles Cooper');
      await userEvent.hover(title);
      const card = await waitFor(() => {
        const dropdown = screen
          .getAllByText('Miles Cooper')
          .map((element) => element.closest<HTMLElement>('.mantine-Popover-dropdown'))
          .find(Boolean);
        expect(dropdown).toBeDefined();
        return within(dropdown as HTMLElement);
      });
      expect(await card.findByText('Dr. Maya Rivera')).toBeInTheDocument();
      expect(card.getByText('Primary').closest('.mantine-Group-root')).toHaveTextContent('Dr. Maya Rivera');
      // It names the visit as the event is titled.
      expect((await card.findByText('Ultrasound Imaging')).parentElement).toHaveTextContent(/^Ultrasound Imaging · /);
      await userEvent.unhover(title);
      expect(eventColor('Renee Alvarez')).toBe(imaging);
      expect(imaging).not.toBe(DEFAULT_THEME.colors.grape[7]);
      // The legend keys those colors by service type.
      expect(await serviceTypeColor('Ultrasound Imaging')).toBe(imaging);
      expect(await serviceTypeColor('Telehealth Consult')).toBe(eventColor('Liam Jones'));
      await userEvent.unhover(screen.getByRole('button', { name: 'Legend' }));
      // The Slots it holds are not drawn as blocked time either; the blocks on show are
      // Exam Room A's maintenance and the buffer after Dr. Chen's infusion.
      expect(screen.getAllByText('Blocked')).toHaveLength(2);

      // Hiding a calendar the visit is not held on leaves it alone.
      await userEvent.click(screen.getByText('Dr. Tunde Okafor').closest('button') as HTMLElement);
      await waitFor(() => expect(appointmentEvents('Renee Alvarez')).toHaveLength(1));
      expect(appointmentEvents('Miles Cooper')).toHaveLength(1);

      // Hiding the provider leaves it too: it is still held on the device and the room.
      await userEvent.click(calendarRow('Dr. Maya Rivera'));
      await waitFor(() => expect(calendarRow('Dr. Maya Rivera')).toHaveAttribute('aria-pressed', 'false'));
      expect(appointmentEvents('Miles Cooper')).toHaveLength(1);
      expect(eventColor('Miles Cooper')).toBe(imaging);

      // Hiding the rest takes it off the calendar.
      for (const label of ['Ultrasound 1 (Main Campus)', 'Exam Room A']) {
        await userEvent.click(calendarRow(label));
      }
      await waitFor(() => expect(appointmentEvents('Miles Cooper')).toHaveLength(0));
      expect(appointmentEvents('Renee Alvarez')).toHaveLength(1);
    });

    test('a service type still being read holds back only its own appointments, whose time shows as blocked', async () => {
      clock = useFakeTimers({ now: new Date(2020, 4, 4, 12, 5), shouldAdvanceTime: false, toFake: ['Date'] });

      const medplum = await setupClient([...SchedulingFixtures, ...CalendarWeekFixtures]);
      medplum.invalidateAll();
      // Telehealth's read waits until the test lets it through.
      let releaseTelehealth = (): void => undefined;
      const readResource = medplum.readResource.bind(medplum);
      vi.spyOn(medplum, 'readResource').mockImplementation(((resourceType, id, options) => {
        if (resourceType === 'HealthcareService' && id === TelehealthService.id) {
          return new Promise((resolve) => {
            releaseTelehealth = () => resolve(readResource(resourceType, id, options));
          });
        }
        return readResource(resourceType, id, options);
      }) as typeof medplum.readResource);
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      // Imaging is drawn without waiting on Telehealth.
      await waitFor(() => expect(appointmentEvents('Miles Cooper')).toHaveLength(1));
      expect(appointmentEvents('Liam Jones')).toHaveLength(0);
      // Dr. Brown's four telehealth Slots show as blocked beside the two blocks always on show.
      await waitFor(() => expect(screen.getAllByText('Blocked')).toHaveLength(6));

      releaseTelehealth();
      await waitFor(() => expect(appointmentEvents('Liam Jones')).toHaveLength(1));
      expect(screen.getAllByText('Blocked')).toHaveLength(2);
    });
  });

  describe('saying which clock the calendar is drawn on', () => {
    test('warns when a calendar is scheduled somewhere other than the viewer', async () => {
      // The fixtures' providers are scheduled in Eastern and Central time and the runner is not,
      // which is the situation the notice exists for: the grid above it is drawn on the runner's clock.
      const medplum = await setupClient();
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      const notice = await screen.findByTestId('calendar-timezone-notice');
      expect(notice).toHaveTextContent('Calendar shown in your local time');
    });

    test('stops warning once every calendar kept elsewhere is deselected', async () => {
      const medplum = await setupClient();
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      await screen.findByTestId('calendar-timezone-notice');
      await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText('Dr. Tunde Okafor')).toBeInTheDocument());

      await userEvent.click(screen.getByText('Dr. Maya Rivera').closest('button') as HTMLElement);
      await userEvent.click(screen.getByText('Dr. Tunde Okafor').closest('button') as HTMLElement);

      // Neither calendar left on the grid is drawn on another clock, so there is nothing to warn about.
      await waitFor(() => expect(screen.queryByTestId('calendar-timezone-notice')).toBeNull());
    });
  });
});

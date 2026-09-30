// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { SinonFakeTimers } from 'sinon';
import { useFakeTimers } from 'sinon';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { BOOKABLE_ACTOR_TYPES } from '../actors';
import { CalendarWeekFixtures, SchedulingFixtures } from '../stories/scheduling';
import { pillRemoveButton } from '../test-utils/asyncAutocomplete';
import { renderWithMedplum, screen, userEvent, waitFor, within } from '../test-utils/render';
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
  await userEvent.click(await screen.findByText(option));
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
 * The Mantine color a calendar's row is drawn in, read off the swatch Mantine styles inline.
 *
 * No fixture Schedule names a color, so every row is on the cycled fallback palette — which
 * is the palette a filter can shift a calendar along.
 *
 * @param label - The calendar's row label.
 * @returns The Mantine color name.
 */
function calendarColor(label: string): string {
  const row = screen.getByText(label).closest('button') as HTMLElement;
  const swatch = row.querySelector('[style*="-bg"]');
  const color = /--(?:avatar|ti)-bg: var\(--mantine-color-([a-z]+)-/.exec(swatch?.getAttribute('style') ?? '')?.[1];
  if (!color) {
    throw new Error(`No color on the row for ${label}`);
  }
  return color;
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

  test('shows the empty state for sections with no schedules', async () => {
    // A fresh MockClient always seeds its own default provider (Dr. Alice Smith)
    // and its Schedule, but no devices or rooms, so those two sections stay empty
    // without needing any scheduling fixtures.
    const medplum = await setupClient([]);
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await waitFor(() => expect(screen.getByText('No devices found')).toBeInTheDocument());
    expect(screen.getByText('No rooms found')).toBeInTheDocument();
  });

  test('a calendar keeps its color when a filter drops the ones listed before it', async () => {
    const medplum = await setupClient();
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await waitFor(() => expect(screen.getByText('Satellite Exam Room')).toBeInTheDocument());
    const color = calendarColor('Satellite Exam Room');

    // The satellite keeps its own room and drops both main campus rooms listed above it,
    // which is what would shift the satellite room onto another color if the palette were
    // picked by position in the narrowed list.
    await chooseFilter('All locations', 'Uro Associates - Satellite');
    await waitFor(() => expect(screen.queryByText('Exam Room A')).not.toBeInTheDocument());
    expect(calendarColor('Satellite Exam Room')).toBe(color);

    await clearFilter('Uro Associates - Satellite');
    await waitFor(() => expect(screen.getByText('Exam Room A')).toBeInTheDocument());
    expect(calendarColor('Satellite Exam Room')).toBe(color);
  });

  describe('Location filter', () => {
    test('choosing a site narrows the calendars to the ones held there', async () => {
      const medplum = await setupClient();
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      await waitFor(() => expect(screen.getByText('Exam Room A')).toBeInTheDocument());

      await chooseFilter('All locations', 'Uro Associates - Satellite');

      // Exam Room A sits under the main clinic, two `partOf` hops from the satellite.
      await waitFor(() => expect(screen.queryByText('Exam Room A')).not.toBeInTheDocument());
      expect(screen.getByText('Satellite Exam Room')).toBeInTheDocument();
    });

    test('going back to All locations restores the calendars a site hid', async () => {
      const medplum = await setupClient();
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      await waitFor(() => expect(screen.getByText('Exam Room A')).toBeInTheDocument());
      await chooseFilter('All locations', 'Uro Associates - Satellite');
      await waitFor(() => expect(screen.queryByText('Exam Room A')).not.toBeInTheDocument());

      await clearFilter('Uro Associates - Satellite');

      await waitFor(() => expect(screen.getByText('Exam Room A')).toBeInTheDocument());
    });

    // Guards a performance regression. The candidate search is keyed on the chosen
    // visit type, so a site change that hands back an equal-but-new object for it fires
    // that search a second time. The fields hold the resource the user picked rather
    // than looking an id up in a list they re-fetched, which is what keeps the identity
    // stable — but nothing about that is visible, so it is worth asserting.
    test('changing site searches the calendars only once', async () => {
      const medplum = await setupClient();
      const search = vi.spyOn(medplum, 'search');
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      // Start by selecting a HealthcareService the satellite also holds, so the site
      // change below leaves it standing and the search has a reason to re-fire.
      await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());
      await chooseFilter('All visit types', 'Telehealth Consult');
      await waitFor(() => expect(screen.getByText('No providers or staff found')).toBeInTheDocument());

      search.mockClear();
      await chooseFilter('All locations', 'Uro Associates - Satellite');
      await waitFor(() => expect(screen.queryByPlaceholderText('All locations')).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByLabelText(/^Loading /)).not.toBeInTheDocument());

      // The visit type still stands, so this is one site change and nothing else.
      expect(screen.getByText('Telehealth Consult')).toBeInTheDocument();
      // Check we have emitted only a single query per resource type
      expect(search.mock.calls.filter(([resourceType]) => resourceType === 'Schedule')).toHaveLength(
        BOOKABLE_ACTOR_TYPES.length
      );
    });
  });

  describe('Visit Type filter', () => {
    test('starts on All, with every calendar listed', async () => {
      const medplum = await setupClient();
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());
      // An empty field is what "all of them" reads as, so its placeholder standing —
      // rather than a pill covering it — is what says nothing is filtered.
      expect(screen.getByPlaceholderText('All visit types')).toBeInTheDocument();
      expect(screen.getByText('Ultrasound 1 (Main Campus)')).toBeInTheDocument();
      expect(screen.getByText('Exam Room A')).toBeInTheDocument();
    });

    test('choosing a visit type narrows the calendars to the ones serving it', async () => {
      const medplum = await setupClient();
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());

      // Every fixture Schedule links to imaging, so telehealth leaves nothing behind.
      await chooseFilter('All visit types', 'Telehealth Consult');

      await waitFor(() => expect(screen.getByText('No providers or staff found')).toBeInTheDocument());
      expect(screen.getByText('No devices found')).toBeInTheDocument();
      expect(screen.getByText('No rooms found')).toBeInTheDocument();
    });

    test('choosing the visit type the calendars serve keeps them', async () => {
      const medplum = await setupClient();
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());

      await chooseFilter('All visit types', 'Ultrasound Imaging');

      await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());
      expect(screen.getByText('Ultrasound 1 (Main Campus)')).toBeInTheDocument();
    });

    test('going back to All restores the calendars a visit type hid', async () => {
      const medplum = await setupClient();
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());
      await chooseFilter('All visit types', 'Telehealth Consult');
      await waitFor(() => expect(screen.getByText('No providers or staff found')).toBeInTheDocument());

      await clearFilter('Telehealth Consult');

      await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());
      expect(screen.getByText('Exam Room A')).toBeInTheDocument();
    });

    test('a calendar hidden by hand can still be un-hidden after a round trip that dropped it', async () => {
      const medplum = await setupClient();
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());
      await userEvent.click(screen.getByText('Dr. Maya Rivera').closest('button') as HTMLElement);

      // Out of the list under telehealth, then back under All, still hidden...
      await chooseFilter('All visit types', 'Telehealth Consult');
      await waitFor(() => expect(screen.queryByText('Dr. Maya Rivera')).not.toBeInTheDocument());
      await clearFilter('Telehealth Consult');
      await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());

      // ...but a row is drawn for every candidate whatever its state, so it is always
      // there to click back on. A hide can never strand a calendar off the panel.
      const providerRow = screen.getByText('Dr. Maya Rivera').closest('button') as HTMLElement;
      expect(providerRow).toHaveAttribute('aria-pressed', 'false');

      await userEvent.click(providerRow);

      expect(providerRow).toHaveAttribute('aria-pressed', 'true');
    });

    test('a calendar hidden by hand stays hidden across a visit type change', async () => {
      const medplum = await setupClient();
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());
      await userEvent.click(screen.getByText('Dr. Maya Rivera').closest('button') as HTMLElement);

      await chooseFilter('All visit types', 'Ultrasound Imaging');

      await waitFor(() => {
        expect(screen.getByText('Dr. Maya Rivera').closest('button')).toHaveAttribute('aria-pressed', 'false');
      });
    });
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

    test(`shows the fixtures' booked appointments and free/blocked slots on the pinned "today"`, async () => {
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
      expect(screen.getAllByText('Available').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);
    });

    test('a source only shows appointments booked on its own schedule', async () => {
      clock = useFakeTimers({ now: new Date(2020, 4, 4, 12, 5), shouldAdvanceTime: false, toFake: ['Date'] });

      const medplum = await setupClient([...SchedulingFixtures, ...CalendarWeekFixtures]);
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      await waitFor(() => expect(screen.getAllByText('Miles Cooper').length).toBeGreaterThan(0));
      const milesCountBefore = screen.getAllByText('Miles Cooper').length;

      // Dr. Okafor's schedule is not one of Miles Cooper's participants (that
      // appointment is Dr. Rivera's), so deselecting it must leave the Miles Cooper
      // count exactly unchanged. If sources ever stopped filtering by their own
      // schedule's actor — e.g. handing every source every appointment — removing
      // Okafor's source would *also* drop a Miles Cooper copy, since that source
      // would incorrectly be carrying one. An unrelated toggle changing an
      // unrelated appointment's count is exactly the bug this guards against.
      await userEvent.click(screen.getByText('Dr. Tunde Okafor').closest('button') as HTMLElement);
      await waitFor(() => expect(screen.getAllByText('Renee Alvarez').length).toBeGreaterThan(0));
      expect(screen.getAllByText('Miles Cooper').length).toBe(milesCountBefore);

      // Deselecting every schedule actually tied to Miles Cooper's appointment
      // (provider, device, and room) must clear it entirely, while the still
      // partly-selected Okafor/Renee appointment (device + room still selected)
      // stays visible.
      for (const label of ['Dr. Maya Rivera', 'Ultrasound 1 (Main Campus)', 'Exam Room A']) {
        await userEvent.click(screen.getByText(label).closest('button') as HTMLElement);
      }

      await waitFor(() => expect(screen.queryByText('Miles Cooper')).not.toBeInTheDocument());
      expect(screen.getAllByText('Renee Alvarez').length).toBeGreaterThan(0);
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

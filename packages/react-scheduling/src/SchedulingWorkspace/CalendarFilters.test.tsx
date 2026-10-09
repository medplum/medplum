// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { describe, expect, test, vi } from 'vitest';
import { SatelliteClinic, SchedulingFixtures } from '../stories/scheduling';
import {
  clickAutocompleteOption,
  installAutocompleteTimers,
  openAutocomplete,
  settleAutocomplete,
  typeInAutocomplete,
} from '../test-utils/asyncAutocomplete';
import { renderWithMedplum, screen, userEvent } from '../test-utils/render';
import type { CalendarFilterValues } from './CalendarFilters';
import { CalendarFilters } from './CalendarFilters';

const medplum = new MockClient();
await Promise.all(SchedulingFixtures.map(async (resource) => medplum.createResource(resource)));

/**
 * Renders the fields and keeps whatever they last reported, which is all a host sees
 * of them.
 *
 * @param defaultValue - What the fields start on.
 * @returns A reader for the latest report, empty until something is chosen, and how
 * many reports there have been.
 */
function setup(defaultValue?: CalendarFilterValues): {
  readonly latest: () => CalendarFilterValues;
  readonly reports: () => number;
} {
  let reported: CalendarFilterValues = {};
  let count = 0;
  renderWithMedplum(
    <CalendarFilters
      defaultValue={defaultValue}
      onChange={(next) => {
        reported = next;
        count++;
      }}
    />,
    medplum
  );
  return { latest: () => reported, reports: () => count };
}

function locationField(): HTMLElement {
  return screen.getByPlaceholderText(/location/);
}

function locationsReported(values: CalendarFilterValues): (string | undefined)[] {
  return (values.locations ?? []).map((location) => ('id' in location ? location.id : location.reference));
}

function serviceField(): HTMLElement {
  return screen.getByPlaceholderText(/visit type/);
}

function servicesReported(values: CalendarFilterValues): string[] {
  return (values.services ?? []).map((service) => service.id);
}

async function removeChoice(name: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: `Remove ${name}` }));
  await settleAutocomplete();
}

describe('CalendarFilters', () => {
  installAutocompleteTimers();

  describe('Location', () => {
    test('offers the sites, not the rooms held inside them', async () => {
      setup();

      await openAutocomplete(locationField());

      expect(screen.getByText('Uro Associates - Main Clinic')).toBeInTheDocument();
      expect(screen.getByText('Uro Associates - Satellite')).toBeInTheDocument();
      // Exam Room A is a calendar, listed under Rooms — never a site to filter by.
      expect(screen.queryByText('Exam Room A')).not.toBeInTheDocument();
      expect(screen.queryByText('Exam Room A Bed 1')).not.toBeInTheDocument();
    });

    test('searching narrows the sites to what was typed, without listing every one', async () => {
      const searchResources = vi.spyOn(medplum, 'searchResources');
      setup();

      await typeInAutocomplete(locationField(), 'Satellite');

      expect(screen.getByText('Uro Associates - Satellite')).toBeInTheDocument();
      expect(screen.queryByText('Uro Associates - Main Clinic')).not.toBeInTheDocument();
      // The server did the narrowing, so a tenant with more sites than one page holds
      // still reaches the one it typed for.
      const criteria = searchResources.mock.calls.find(([resourceType]) => resourceType === 'Location')?.[1];
      expect(new URLSearchParams(criteria as Record<string, string>).get('name')).toBe('Satellite');
      searchResources.mockRestore();
    });

    test('reports the chosen site', async () => {
      const { latest } = setup();

      await openAutocomplete(locationField());
      await clickAutocompleteOption('Uro Associates - Satellite');

      expect(locationsReported(latest())).toEqual(['satellite-clinic']);
    });

    test('taking the site off goes back to every site', async () => {
      const { latest } = setup();
      await openAutocomplete(locationField());
      await clickAutocompleteOption('Uro Associates - Satellite');
      expect(locationsReported(latest())).toEqual(['satellite-clinic']);

      await removeChoice('Uro Associates - Satellite');

      expect(locationsReported(latest())).toEqual([]);
      // Shown as well as reported: an empty field is what "all of them" reads as, so a
      // stale row would leave the sidebar claiming a filter that no longer stands.
      expect(screen.getByPlaceholderText('All locations')).toBeInTheDocument();
      expect(screen.queryByText('Uro Associates - Satellite')).not.toBeInTheDocument();
    });

    test('sites add up, in the order they were chosen', async () => {
      const { latest } = setup();
      await openAutocomplete(locationField());
      await clickAutocompleteOption('Uro Associates - Satellite');
      await openAutocomplete(locationField());
      await clickAutocompleteOption('Uro Associates - Main Clinic');

      expect(locationsReported(latest())).toEqual(['satellite-clinic', 'main-clinic']);
      expect(screen.getByRole('button', { name: 'Remove Uro Associates - Satellite' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove Uro Associates - Main Clinic' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Add a location')).toHaveValue('');
    });
  });

  describe('Visit Type', () => {
    test('offers only the visit types configured for scheduling', async () => {
      setup();

      await openAutocomplete(serviceField());

      expect(screen.getByText('Ultrasound Imaging')).toBeInTheDocument();
      expect(screen.getByText('Telehealth Consult')).toBeInTheDocument();
      // Walk-in Clinic carries no SchedulingParameters, so nothing could be booked against it.
      expect(screen.queryByText('Walk-in Clinic')).not.toBeInTheDocument();
    });

    test('searching narrows the visit types to what was typed', async () => {
      setup();

      await typeInAutocomplete(serviceField(), 'Telehealth');

      expect(screen.getByText('Telehealth Consult')).toBeInTheDocument();
      expect(screen.queryByText('Ultrasound Imaging')).not.toBeInTheDocument();
    });

    test('lists a chosen visit type under the field, which is left empty for another', async () => {
      setup();
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Telehealth Consult');

      expect(screen.getByText('Telehealth Consult')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove Telehealth Consult' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Add a visit type')).toHaveValue('');
    });

    test('visit types add up, in the order they were chosen', async () => {
      const { latest } = setup();
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Telehealth Consult');
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Ultrasound Imaging');

      expect(servicesReported(latest())).toEqual(['telehealth-consult', 'ultrasound-imaging']);
    });

    test('a chosen visit type is not offered again', async () => {
      setup();
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Telehealth Consult');

      await openAutocomplete(serviceField());

      expect(screen.getByText('Ultrasound Imaging')).toBeInTheDocument();
      expect(screen.getAllByText('Telehealth Consult')).toHaveLength(1);
    });

    test('removing a visit type keeps the others', async () => {
      const { latest } = setup();
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Telehealth Consult');
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Ultrasound Imaging');

      await removeChoice('Telehealth Consult');

      expect(servicesReported(latest())).toEqual(['ultrasound-imaging']);
      expect(screen.queryByText('Telehealth Consult')).not.toBeInTheDocument();
    });

    test('removing the last visit type goes back to every visit type', async () => {
      const { latest } = setup();
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Telehealth Consult');

      await removeChoice('Telehealth Consult');

      expect(servicesReported(latest())).toEqual([]);
      expect(screen.getByPlaceholderText('All visit types')).toBeInTheDocument();
    });

    test('reports the chosen visit type', async () => {
      const { latest } = setup();

      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Telehealth Consult');

      expect(servicesReported(latest())).toEqual(['telehealth-consult']);
    });

    test('a chosen site narrows the visit types to the ones held there', async () => {
      setup();
      await openAutocomplete(locationField());
      await clickAutocompleteOption('Uro Associates - Satellite');

      await openAutocomplete(serviceField());

      // Ultrasound Imaging names the main clinic; telehealth names no site at all, so
      // it survives every site change.
      expect(screen.getByText('Telehealth Consult')).toBeInTheDocument();
      expect(screen.queryByText('Ultrasound Imaging')).not.toBeInTheDocument();
    });
  });

  describe('starting on a site', () => {
    test('shows the site without reporting it', async () => {
      const { reports } = setup({ locations: [SatelliteClinic] });
      await settleAutocomplete();

      expect(screen.getByText('Uro Associates - Satellite')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('All locations')).not.toBeInTheDocument();
      expect(reports()).toBe(0);
    });

    test('narrows the visit types to the ones held there from the start', async () => {
      setup({ locations: [SatelliteClinic] });

      await openAutocomplete(serviceField());

      expect(screen.getByText('Telehealth Consult')).toBeInTheDocument();
      expect(screen.queryByText('Ultrasound Imaging')).not.toBeInTheDocument();
    });

    test('taking the site off goes back to every site', async () => {
      const { latest } = setup({ locations: [SatelliteClinic] });
      await settleAutocomplete();

      await removeChoice('Uro Associates - Satellite');

      expect(locationsReported(latest())).toEqual([]);
      expect(screen.getByPlaceholderText('All locations')).toBeInTheDocument();
    });
  });

  describe('the rule between them', () => {
    test('changing site drops a chosen visit type the new site does not hold', async () => {
      const { latest } = setup();
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Ultrasound Imaging');
      expect(servicesReported(latest())).toEqual(['ultrasound-imaging']);

      await openAutocomplete(locationField());
      await clickAutocompleteOption('Uro Associates - Satellite');
      await settleAutocomplete();

      expect(servicesReported(latest())).toEqual([]);
      // Reported *and* shown: a stale row would leave the sidebar claiming a filter that
      // no longer stands.
      expect(screen.getByPlaceholderText('All visit types')).toBeInTheDocument();
      expect(screen.queryByText('Ultrasound Imaging')).not.toBeInTheDocument();
    });

    test('changing site keeps a chosen visit type the new site does hold', async () => {
      const { latest } = setup();
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Telehealth Consult');

      await openAutocomplete(locationField());
      await clickAutocompleteOption('Uro Associates - Satellite');
      await settleAutocomplete();

      expect(servicesReported(latest())).toEqual(['telehealth-consult']);
    });

    test('clearing the site keeps a visit type only that site held', async () => {
      const { latest } = setup();
      await openAutocomplete(locationField());
      await clickAutocompleteOption('Uro Associates - Main Clinic');
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Ultrasound Imaging');

      // With no site chosen every visit type is held somewhere, so nothing about this
      // one has stopped being true and it is not the site's to drop.
      await removeChoice('Uro Associates - Main Clinic');
      await settleAutocomplete();

      expect(servicesReported(latest())).toEqual(['ultrasound-imaging']);
      // Still listed, too.
      expect(screen.getByText('Ultrasound Imaging')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('All visit types')).not.toBeInTheDocument();
    });

    test('a chosen visit type never changes the sites on offer', async () => {
      setup();
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Telehealth Consult');

      await openAutocomplete(locationField());

      expect(screen.getByText('Uro Associates - Main Clinic')).toBeInTheDocument();
      expect(screen.getByText('Uro Associates - Satellite')).toBeInTheDocument();
    });
  });
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { describe, expect, test, vi } from 'vitest';
import { SatelliteClinic, SchedulingFixtures } from '../stories/scheduling';
import {
  clickAutocompleteOption,
  installAutocompleteTimers,
  openAutocomplete,
  removePill,
  settleAutocomplete,
  typeInAutocomplete,
} from '../test-utils/asyncAutocomplete';
import { fireEvent, renderWithMedplum, screen } from '../test-utils/render';
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

function serviceFacilityField(): HTMLElement {
  return screen.getByPlaceholderText('All service facilities');
}

function serviceField(): HTMLElement {
  return screen.getByPlaceholderText('All visit types');
}

describe('CalendarFilters', () => {
  installAutocompleteTimers();

  describe('Service facility', () => {
    test('offers the sites, not the rooms held inside them', async () => {
      setup();

      await openAutocomplete(serviceFacilityField());

      expect(screen.getByText('Uro Associates - Main Clinic')).toBeInTheDocument();
      expect(screen.getByText('Uro Associates - Satellite')).toBeInTheDocument();
      // Named only, without the generic resource row's avatar and id.
      expect(screen.queryByText(SatelliteClinic.id)).not.toBeInTheDocument();
      // Exam Room A is a calendar, listed under Rooms — never a site to filter by.
      expect(screen.queryByText('Exam Room A')).not.toBeInTheDocument();
      expect(screen.queryByText('Exam Room A Bed 1')).not.toBeInTheDocument();
    });

    test('leaves out a site that is inactive because it is not live yet', async () => {
      await medplum.createResource({ resourceType: 'Location', name: 'Uro Associates - North', status: 'inactive' });
      setup();

      await openAutocomplete(serviceFacilityField());

      // Neither clinic records a status, and both are still offered.
      expect(screen.getByText('Uro Associates - Main Clinic')).toBeInTheDocument();
      expect(screen.getByText('Uro Associates - Satellite')).toBeInTheDocument();
      expect(screen.queryByText('Uro Associates - North')).not.toBeInTheDocument();
    });

    test('searching narrows the sites to what was typed, without listing every one', async () => {
      const searchResources = vi.spyOn(medplum, 'searchResources');
      setup();

      await typeInAutocomplete(serviceFacilityField(), 'Satellite');

      expect(screen.getByText('Uro Associates - Satellite')).toBeInTheDocument();
      expect(screen.queryByText('Uro Associates - Main Clinic')).not.toBeInTheDocument();
      // The server did the narrowing, so a tenant with more sites than one page holds
      // still reaches the one it typed for.
      const criteria = searchResources.mock.calls.find(([resourceType]) => resourceType === 'Location')?.[1];
      // Matched anywhere in the name, as "Satellite" is past its first word.
      expect(new URLSearchParams(criteria as Record<string, string>).get('name:contains')).toBe('Satellite');
      searchResources.mockRestore();
    });

    test('reports the chosen site', async () => {
      const { latest } = setup();

      await openAutocomplete(serviceFacilityField());
      await clickAutocompleteOption('Uro Associates - Satellite');

      expect(latest().serviceFacilities?.map((site) => site.id)).toEqual(['satellite-clinic']);
    });

    test('taking the pill off goes back to every site', async () => {
      const { latest } = setup();
      await openAutocomplete(serviceFacilityField());
      await clickAutocompleteOption('Uro Associates - Satellite');
      expect(latest().serviceFacilities?.map((site) => site.id)).toEqual(['satellite-clinic']);

      await removePill('Uro Associates - Satellite');

      expect(latest().serviceFacilities).toEqual([]);
      // Shown as well as reported: the empty field's placeholder is what "all of them" reads as,
      // so a stale pill would leave the sidebar claiming a filter that no longer stands.
      expect(serviceFacilityField()).toBeInTheDocument();
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

    test('choosing one unticks All, and taking the last one off leaves none, until All is ticked again', async () => {
      const { latest } = setup();
      const all = screen.getByRole('checkbox', { name: 'All visit types' });
      expect(all).toBeChecked();

      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Telehealth Consult');
      expect(latest().services?.map((s) => s.id)).toEqual(['telehealth-consult']);
      expect(all).not.toBeChecked();

      await removePill('Telehealth Consult');
      // An empty list includes nothing, where an absent one is every visit type.
      expect(latest().services).toEqual([]);
      expect(screen.getByPlaceholderText('No appointments shown')).toBeInTheDocument();

      fireEvent.click(all);
      expect(latest().services).toBeUndefined();
      expect(serviceField()).toBeInTheDocument();
    });

    test('unticking All with nothing chosen includes no visit type', async () => {
      const { latest } = setup();

      fireEvent.click(screen.getByRole('checkbox', { name: 'All visit types' }));

      expect(latest().services).toEqual([]);
    });

    test('reports the chosen visit type', async () => {
      const { latest } = setup();

      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Telehealth Consult');

      expect(latest().services?.map((s) => s.id)).toEqual(['telehealth-consult']);
    });

    test('a chosen site narrows the visit types to the ones held there', async () => {
      setup();
      await openAutocomplete(serviceFacilityField());
      await clickAutocompleteOption('Uro Associates - Satellite');

      await openAutocomplete(serviceField());

      // Ultrasound Imaging names the main clinic; telehealth names no site at all, so
      // it survives every site change.
      expect(screen.getByText('Telehealth Consult')).toBeInTheDocument();
      expect(screen.queryByText('Ultrasound Imaging')).not.toBeInTheDocument();
    });
  });

  describe('Availability', () => {
    function availabilityField(): HTMLElement {
      return screen.getByPlaceholderText('None shown');
    }

    test('is reported apart from the Visit Type filter, which it leaves on every visit type', async () => {
      const { latest } = setup();

      await openAutocomplete(availabilityField());
      await clickAutocompleteOption('Telehealth Consult');

      expect(latest().availabilityServices?.map((s) => s.id)).toEqual(['telehealth-consult']);
      expect(latest().services).toBeUndefined();
      expect(serviceField()).toBeInTheDocument();
    });

    test('changing site drops a visit type the new site does not hold', async () => {
      const { latest } = setup();
      await openAutocomplete(availabilityField());
      await clickAutocompleteOption('Ultrasound Imaging');

      await openAutocomplete(serviceFacilityField());
      await clickAutocompleteOption('Uro Associates - Satellite');
      await settleAutocomplete();

      expect(latest().availabilityServices).toEqual([]);
      expect(availabilityField()).toBeInTheDocument();
    });
  });

  describe('starting on a site', () => {
    test('shows the site without reporting it', async () => {
      const { reports } = setup({ serviceFacilities: [SatelliteClinic] });
      await settleAutocomplete();

      expect(screen.getByText('Uro Associates - Satellite')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('All service facilities')).not.toBeInTheDocument();
      expect(reports()).toBe(0);
    });

    test('narrows the visit types to the ones held there from the start', async () => {
      setup({ serviceFacilities: [SatelliteClinic] });

      await openAutocomplete(serviceField());

      expect(screen.getByText('Telehealth Consult')).toBeInTheDocument();
      expect(screen.queryByText('Ultrasound Imaging')).not.toBeInTheDocument();
    });

    test('taking the pill off goes back to every site', async () => {
      const { latest } = setup({ serviceFacilities: [SatelliteClinic] });
      await settleAutocomplete();

      await removePill('Uro Associates - Satellite');

      expect(latest().serviceFacilities).toEqual([]);
      expect(serviceFacilityField()).toBeInTheDocument();
    });
  });

  describe('the rule between them', () => {
    test('changing site drops a chosen visit type the new site does not hold', async () => {
      const { latest } = setup();
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Ultrasound Imaging');
      expect(latest().services?.map((s) => s.id)).toEqual(['ultrasound-imaging']);

      await openAutocomplete(serviceFacilityField());
      await clickAutocompleteOption('Uro Associates - Satellite');
      await settleAutocomplete();

      // Back to every visit type, not to none: it was the site that emptied the list.
      expect(latest().services).toBeUndefined();
      expect(screen.getByRole('checkbox', { name: 'All visit types' })).toBeChecked();
      // Reported *and* shown: the field ignores `defaultValue` after mount, so a stale
      // pill would leave the sidebar claiming a filter that no longer stands.
      expect(serviceField()).toBeInTheDocument();
      expect(screen.queryByText('Ultrasound Imaging')).not.toBeInTheDocument();
    });

    test('changing site drops only the chosen visit types the new site does not hold', async () => {
      const { latest } = setup();
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Ultrasound Imaging');
      await openAutocomplete(screen.getByPlaceholderText('Add a visit type'));
      await clickAutocompleteOption('Telehealth Consult');
      expect(latest().services?.map((s) => s.id)).toEqual(['ultrasound-imaging', 'telehealth-consult']);

      await openAutocomplete(serviceFacilityField());
      await clickAutocompleteOption('Uro Associates - Satellite');
      await settleAutocomplete();

      expect(latest().services?.map((s) => s.id)).toEqual(['telehealth-consult']);
      expect(screen.queryByText('Ultrasound Imaging')).not.toBeInTheDocument();
    });

    test('a visit type held at any one of several chosen sites is kept', async () => {
      const { latest } = setup();
      await openAutocomplete(serviceFacilityField());
      await clickAutocompleteOption('Uro Associates - Main Clinic');
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Ultrasound Imaging');

      await openAutocomplete(screen.getByPlaceholderText('Add a service facility'));
      await clickAutocompleteOption('Uro Associates - Satellite');
      await settleAutocomplete();

      expect(latest().serviceFacilities?.map((site) => site.id)).toEqual(['main-clinic', 'satellite-clinic']);
      expect(latest().services?.map((s) => s.id)).toEqual(['ultrasound-imaging']);
    });

    test('changing site keeps a chosen visit type the new site does hold', async () => {
      const { latest } = setup();
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Telehealth Consult');

      await openAutocomplete(serviceFacilityField());
      await clickAutocompleteOption('Uro Associates - Satellite');
      await settleAutocomplete();

      expect(latest().services?.map((s) => s.id)).toEqual(['telehealth-consult']);
    });

    test('clearing the site keeps a visit type only that site held', async () => {
      const { latest } = setup();
      await openAutocomplete(serviceFacilityField());
      await clickAutocompleteOption('Uro Associates - Main Clinic');
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Ultrasound Imaging');

      // With no site chosen every visit type is held somewhere, so nothing about this
      // one has stopped being true and it is not the site's to drop.
      await removePill('Uro Associates - Main Clinic');
      await settleAutocomplete();

      expect(latest().services?.map((s) => s.id)).toEqual(['ultrasound-imaging']);
      // Still shown, too — the visit type field must not have been remounted, which
      // would have emptied it and put its empty placeholder back.
      expect(screen.queryByPlaceholderText('All visit types')).not.toBeInTheDocument();
    });

    test('a chosen visit type never changes the sites on offer', async () => {
      setup();
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Telehealth Consult');

      await openAutocomplete(serviceFacilityField());

      expect(screen.getByText('Uro Associates - Main Clinic')).toBeInTheDocument();
      expect(screen.getByText('Uro Associates - Satellite')).toBeInTheDocument();
    });
  });
});

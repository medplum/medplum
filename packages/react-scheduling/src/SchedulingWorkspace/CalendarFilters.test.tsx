// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { describe, expect, test, vi } from 'vitest';
import { SchedulingFixtures } from '../stories/scheduling';
import {
  clickAutocompleteOption,
  installAutocompleteTimers,
  openAutocomplete,
  removePill,
  settleAutocomplete,
  typeInAutocomplete,
} from '../test-utils/asyncAutocomplete';
import { renderWithMedplum, screen } from '../test-utils/render';
import type { CalendarFilterValues } from './CalendarFilters';
import { CalendarFilters } from './CalendarFilters';

const medplum = new MockClient();
await Promise.all(SchedulingFixtures.map(async (resource) => medplum.createResource(resource)));

/**
 * Renders the fields and keeps whatever they last reported, which is all a host sees
 * of them.
 *
 * @returns A reader for the latest report, empty until something is chosen.
 */
function setup(): { readonly latest: () => CalendarFilterValues } {
  let reported: CalendarFilterValues = {};
  renderWithMedplum(<CalendarFilters onChange={(next) => (reported = next)} />, medplum);
  return { latest: () => reported };
}

function locationField(): HTMLElement {
  return screen.getByPlaceholderText('All locations');
}

function serviceField(): HTMLElement {
  return screen.getByPlaceholderText('All visit types');
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

      expect(latest().location?.id).toBe('satellite-clinic');
    });

    test('taking the pill off goes back to every site', async () => {
      const { latest } = setup();
      await openAutocomplete(locationField());
      await clickAutocompleteOption('Uro Associates - Satellite');
      expect(latest().location?.id).toBe('satellite-clinic');

      // The pill's own remove button, which is the only way back: it is aria-hidden with
      // tabindex=-1, and capping the field at one value hides the input backspace would
      // work in, so there is no keyboard or screen reader route to un-filtering yet.
      // Tracked in https://github.com/medplum/medplum/issues/10609.
      await removePill('Uro Associates - Satellite');

      expect(latest().location).toBeUndefined();
      // Shown as well as reported: an empty field is what "all of them" reads as, so a
      // stale pill would leave the sidebar claiming a filter that no longer stands.
      expect(locationField()).toBeInTheDocument();
      expect(screen.queryByText('Uro Associates - Satellite')).not.toBeInTheDocument();
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

    test('taking the pill off goes back to every visit type', async () => {
      const { latest } = setup();
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Telehealth Consult');
      expect(latest().service?.id).toBe('telehealth-consult');

      await removePill('Telehealth Consult');

      expect(latest().service).toBeUndefined();
      expect(serviceField()).toBeInTheDocument();
    });

    test('reports the chosen visit type', async () => {
      const { latest } = setup();

      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Telehealth Consult');

      expect(latest().service?.id).toBe('telehealth-consult');
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

  describe('the rule between them', () => {
    test('changing site drops a chosen visit type the new site does not hold', async () => {
      const { latest } = setup();
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Ultrasound Imaging');
      expect(latest().service?.id).toBe('ultrasound-imaging');

      await openAutocomplete(locationField());
      await clickAutocompleteOption('Uro Associates - Satellite');
      await settleAutocomplete();

      expect(latest().service).toBeUndefined();
      // Reported *and* shown: the field ignores `defaultValue` after mount, so a stale
      // pill would leave the sidebar claiming a filter that no longer stands.
      expect(serviceField()).toBeInTheDocument();
      expect(screen.queryByText('Ultrasound Imaging')).not.toBeInTheDocument();
    });

    test('changing site keeps a chosen visit type the new site does hold', async () => {
      const { latest } = setup();
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Telehealth Consult');

      await openAutocomplete(locationField());
      await clickAutocompleteOption('Uro Associates - Satellite');
      await settleAutocomplete();

      expect(latest().service?.id).toBe('telehealth-consult');
    });

    test('clearing the site keeps a visit type only that site held', async () => {
      const { latest } = setup();
      await openAutocomplete(locationField());
      await clickAutocompleteOption('Uro Associates - Main Clinic');
      await openAutocomplete(serviceField());
      await clickAutocompleteOption('Ultrasound Imaging');

      // With no site chosen every visit type is held somewhere, so nothing about this
      // one has stopped being true and it is not the site's to drop.
      await removePill('Uro Associates - Main Clinic');
      await settleAutocomplete();

      expect(latest().service?.id).toBe('ultrasound-imaging');
      // Still shown, too — the visit type field must not have been remounted, which
      // would have emptied it.
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

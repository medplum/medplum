// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ReadablePromise } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { RenderResult } from '@testing-library/react';
import type { MockInstance } from 'vitest';
import {
  buildSchedulableService,
  MainClinic,
  SatelliteClinic,
  SchedulingFixtures,
  UltrasoundImagingService,
} from '../stories/scheduling';
import {
  clickAutocompleteOption,
  installAutocompleteTimers,
  openAutocomplete,
  settleAutocomplete,
  typeInAutocomplete,
} from '../test-utils/asyncAutocomplete';
import { act, renderWithMedplum, screen, waitFor } from '../test-utils/render';
import type { AppointmentServiceSelectProps } from './AppointmentServiceSelect';
import { AppointmentServiceSelect } from './AppointmentServiceSelect';

const medplum = new MockClient();

/**
 * A second schedulable visit type at the main clinic, for reassigning the field to.
 * Named to sort before the location-less one, so the merged list can interleave.
 */
const BARIATRIC_SURGERY: WithId<HealthcareService> = {
  ...UltrasoundImagingService,
  id: 'bariatric-surgery',
  name: 'Bariatric Surgery',
};

/** Held at the other site only. */
const SATELLITE_ULTRASOUND = buildSchedulableService({
  id: 'satellite-ultrasound',
  name: 'Satellite Ultrasound',
  category: 'Imaging',
  durationMinutes: 45,
  alignmentMinutes: 15,
  locationIds: ['satellite-clinic'],
});

/** Named on no location and configured for nothing, so neither route may offer it. */
const TELEHEALTH_CHAT: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'telehealth-chat',
  name: 'Telehealth Chat',
};

/** Held at a room inside the main clinic, rather than at the clinic itself. */
const EXAM_ROOM_ULTRASOUND = buildSchedulableService({
  id: 'exam-room-ultrasound',
  name: 'Exam Room Ultrasound',
  category: 'Imaging',
  durationMinutes: 60,
  alignmentMinutes: 15,
  locationIds: ['exam-room-a'],
});

function setup(props: Partial<AppointmentServiceSelectProps> = {}, key?: string): RenderResult {
  return renderWithMedplum(<AppointmentServiceSelect key={key} onChange={vi.fn()} {...props} />, medplum);
}

function searchBox(): HTMLElement {
  return screen.getByPlaceholderText('Search visit types');
}

/**
 * The criteria each `HealthcareService` request carried, in the order issued.
 * @param searchResources - The spy on the client's search.
 * @returns One entry per request issued.
 */
function serviceSearches(searchResources: MockInstance): URLSearchParams[] {
  return searchResources.mock.calls
    .filter((call) => call[0] === 'HealthcareService')
    .map((call) => call[1] as URLSearchParams);
}

describe('AppointmentServiceSelect', () => {
  beforeAll(async () => {
    const fixtures = [
      ...SchedulingFixtures,
      BARIATRIC_SURGERY,
      SATELLITE_ULTRASOUND,
      EXAM_ROOM_ULTRASOUND,
      TELEHEALTH_CHAT,
    ];
    for (const resource of fixtures) {
      await medplum.createResource(resource);
    }
  });

  installAutocompleteTimers();

  test('Only offers services configured for scheduling', async () => {
    const searchResources = vi.spyOn(medplum, 'searchResources');
    setup();

    await typeInAutocomplete(searchBox(), 'Clinic');

    // "Walk-in Clinic" has no SchedulingParameters, so $find could never produce times
    // for it. Checking that the server did return it is what makes its absence below
    // evidence of the filter rather than of a search that had not resolved yet.
    const index = searchResources.mock.calls.findIndex((call) => call[0] === 'HealthcareService');
    const returned = (await searchResources.mock.results[index].value) as HealthcareService[];
    expect(returned.map((service) => service.name)).toContain('Walk-in Clinic');
    expect(screen.queryByText('Walk-in Clinic')).not.toBeInTheDocument();
    searchResources.mockRestore();
  });

  test('Says how long each visit type takes', async () => {
    setup();

    await typeInAutocomplete(searchBox(), 'Ultrasound');

    // The length is what tells two otherwise identical visit types apart.
    expect(await screen.findByText(/30 min/)).toBeInTheDocument();
  });

  test('Reports a chosen service', async () => {
    const onChange = vi.fn();
    setup({ onChange });

    await typeInAutocomplete(searchBox(), 'Ultrasound');
    await clickAutocompleteOption('Ultrasound Imaging');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'ultrasound-imaging' }));
  });

  test('Narrows the services to a chosen service facility', async () => {
    const searchResources = vi.spyOn(medplum, 'searchResources');
    setup({ serviceFacility: MainClinic });

    await typeInAutocomplete(searchBox(), 'Ultrasound');

    // Both read on opening; typing filters them without asking again.
    const searches = serviceSearches(searchResources);
    expect(searches).toHaveLength(2);
    expect(searches[0].get('location')).toBe('Location/main-clinic');
    expect(searches[1].get('location:missing')).toBe('true');
    expect(searches.map((params) => [params.get('name:contains'), params.get('_count'), params.get('_sort')])).toEqual([
      [null, '100', 'name'],
      [null, '100', 'name'],
    ]);
    searchResources.mockRestore();
  });

  test('Lists every visit type on opening, not just a first page of them', async () => {
    const manyServices = new MockClient();
    for (let i = 10; i < 40; i++) {
      await manyServices.createResource(
        buildSchedulableService({
          id: `visit-${i}`,
          name: `Visit ${i}`,
          category: 'Office visit',
          durationMinutes: 30,
          alignmentMinutes: 15,
        })
      );
    }
    renderWithMedplum(<AppointmentServiceSelect onChange={vi.fn()} />, manyServices);

    await openAutocomplete(searchBox());
    expect(screen.getAllByRole('option')).toHaveLength(30);

    // Matched anywhere in the name, regardless of case.
    await typeInAutocomplete(searchBox(), 'it 3');
    expect(screen.getAllByRole('option')).toHaveLength(10);
  });

  test('Searches the server as the user types when one read could not hold every visit type', async () => {
    const searchResources = vi.spyOn(medplum, 'searchResources');
    // Unschedulable filler, which still fills the page: there may be more beyond it.
    const fullPage = [
      BARIATRIC_SURGERY,
      ...Array.from({ length: 99 }, (_, i) => ({ ...TELEHEALTH_CHAT, id: `chat-${i}` })),
    ];
    searchResources.mockReturnValueOnce(new ReadablePromise(Promise.resolve(fullPage as never)));
    setup();

    // Opening lists the page already read, without asking again.
    await openAutocomplete(searchBox());
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      expect.stringMatching(/^Bariatric Surgery/),
    ]);
    expect(serviceSearches(searchResources)).toHaveLength(1);

    await typeInAutocomplete(searchBox(), 'Ultrasound');

    expect(await screen.findByText('Ultrasound Imaging')).toBeInTheDocument();
    const searches = serviceSearches(searchResources);
    expect(searches).toHaveLength(2);
    expect([searches[1].get('name:contains'), searches[1].get('_count')]).toEqual(['Ultrasound', '25']);
    searchResources.mockRestore();
  });

  // A caller holding a reference should not have to read the Location first:
  // narrowing needs only the reference string.
  test('Narrows the services to a service facility given as a reference', async () => {
    const searchResources = vi.spyOn(medplum, 'searchResources');
    setup({ serviceFacility: { reference: 'Location/main-clinic' } });

    await typeInAutocomplete(searchBox(), 'Ultrasound');

    expect(serviceSearches(searchResources)[0].get('location')).toBe('Location/main-clinic');
    searchResources.mockRestore();
  });

  test('Drops what the previous site found when the site changes mid-search', async () => {
    // Holds each catalog read until released, failing it if aborted first, as the client does.
    const held: (() => void)[] = [];
    const search = medplum.searchResources.bind(medplum);
    const searchResources = vi.spyOn(medplum, 'searchResources').mockImplementation((resourceType, query, options) => {
      if (resourceType !== 'HealthcareService' || (query as URLSearchParams).get('_count') !== '100') {
        return search(resourceType, query, options);
      }
      return new ReadablePromise(
        new Promise((resolve, reject) => {
          held.push(() => resolve(search(resourceType, query, options)));
          options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
      );
    });
    const { rerender } = setup({ serviceFacility: MainClinic });

    await openAutocomplete(searchBox());
    rerender(<AppointmentServiceSelect onChange={vi.fn()} serviceFacility={SatelliteClinic} />);
    await settleAutocomplete();

    // Held only at the main clinic.
    expect(screen.queryByText('Bariatric Surgery')).not.toBeInTheDocument();

    await typeInAutocomplete(searchBox(), 'Ultrasound');
    await act(async () => held.forEach((release) => release()));
    expect(await screen.findByText('Satellite Ultrasound')).toBeInTheDocument();
    searchResources.mockRestore();
  });

  describe('Offering the visit types a chosen site can hold', () => {
    test('Offers a visit type that names the chosen site', async () => {
      setup({ serviceFacility: MainClinic });

      await typeInAutocomplete(searchBox(), 'Ultrasound');

      expect(await screen.findByText('Ultrasound Imaging')).toBeInTheDocument();
    });

    test('Offers a visit type that names no location, at every site in turn', async () => {
      const { rerender } = setup({ serviceFacility: MainClinic }, 'main');
      await typeInAutocomplete(searchBox(), 'Telehealth');
      expect(await screen.findByText('Telehealth Consult')).toBeInTheDocument();

      rerender(<AppointmentServiceSelect key="satellite" onChange={vi.fn()} serviceFacility={SatelliteClinic} />);
      await typeInAutocomplete(searchBox(), 'Telehealth');

      expect(await screen.findByText('Telehealth Consult')).toBeInTheDocument();
    });

    test('Leaves out a visit type held only somewhere else', async () => {
      setup({ serviceFacility: MainClinic });

      await typeInAutocomplete(searchBox(), 'Ultrasound');

      await screen.findByText('Ultrasound Imaging');
      expect(screen.queryByText('Satellite Ultrasound')).not.toBeInTheDocument();
    });

    test('Leaves out a visit type held at a place inside the chosen site', async () => {
      setup({ serviceFacility: MainClinic });

      await typeInAutocomplete(searchBox(), 'Ultrasound');

      // No `partOf` walk: a visit type is tested against the site it names and nothing
      // below it.
      await screen.findByText('Ultrasound Imaging');
      expect(screen.queryByText('Exam Room Ultrasound')).not.toBeInTheDocument();
    });

    test('Narrows nothing, and asks once, when no site is chosen', async () => {
      const searchResources = vi.spyOn(medplum, 'searchResources');
      setup();

      await typeInAutocomplete(searchBox(), 'Ultrasound');

      const searches = serviceSearches(searchResources);
      expect(searches).toHaveLength(1);
      expect(searches[0].get('location')).toBeNull();
      expect(searches[0].get('location:missing')).toBeNull();
      expect(await screen.findByText('Satellite Ultrasound')).toBeInTheDocument();
      expect(screen.getByText('Ultrasound Imaging')).toBeInTheDocument();
      searchResources.mockRestore();
    });

    test('Finds nothing rather than falling back when a site can hold nothing', async () => {
      setup({ serviceFacility: SatelliteClinic });

      await typeInAutocomplete(searchBox(), 'Imaging');

      // Every visit type matching "Imaging" is held elsewhere, and the location-less one
      // is named something else, so there is nothing left to offer.
      await settleAutocomplete();
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
      expect(screen.queryByText('Ultrasound Imaging')).not.toBeInTheDocument();
    });

    test('Reads as one list in name order, not two lists end to end', async () => {
      setup({ serviceFacility: MainClinic });

      await openAutocomplete(searchBox());

      // The location-less visit type lands between the two sited ones, which appending
      // one search to the other could not produce.
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        expect.stringMatching(/^Bariatric Surgery/),
        expect.stringMatching(/^Telehealth Consult/),
        expect.stringMatching(/^Ultrasound Imaging/),
      ]);
    });

    test('Does not smuggle in an unschedulable visit type by the location-less route', async () => {
      setup({ serviceFacility: MainClinic });

      await typeInAutocomplete(searchBox(), 'Telehealth');

      expect(await screen.findByText('Telehealth Consult')).toBeInTheDocument();
      expect(screen.queryByText('Telehealth Chat')).not.toBeInTheDocument();
    });
  });

  test('Starts on the visit type it was given', async () => {
    setup({ defaultValue: UltrasoundImagingService });
    expect(await screen.findByText('Ultrasound Imaging')).toBeInTheDocument();
  });

  // The field is uncontrolled, so moving it from outside is the caller's job and the key
  // is how it is done. These cover the pattern callers are told to follow.
  test('Moves to a visit type the caller keys it onto', async () => {
    const onChange = vi.fn();
    const { rerender } = setup({ onChange, defaultValue: UltrasoundImagingService }, UltrasoundImagingService.id);
    await screen.findByText('Ultrasound Imaging');

    rerender(
      <AppointmentServiceSelect key={BARIATRIC_SURGERY.id} defaultValue={BARIATRIC_SURGERY} onChange={onChange} />
    );

    expect(await screen.findByText('Bariatric Surgery')).toBeInTheDocument();
    expect(screen.queryByText('Ultrasound Imaging')).not.toBeInTheDocument();
  });

  // The reason a caller has to key this field: a site change can invalidate the visit type
  // on screen, and only the caller knows it has to go.
  test('Empties when a location change keys it onto no visit type', async () => {
    const onChange = vi.fn();
    const { rerender } = setup(
      { onChange, defaultValue: UltrasoundImagingService, serviceFacility: MainClinic },
      UltrasoundImagingService.id
    );
    await screen.findByText('Ultrasound Imaging');

    rerender(
      <AppointmentServiceSelect
        key="empty"
        defaultValue={undefined}
        onChange={onChange}
        serviceFacility={SatelliteClinic}
      />
    );

    await waitFor(() => expect(screen.queryByText('Ultrasound Imaging')).not.toBeInTheDocument());
    // Clearing from outside is the caller's decision, not a new answer to report back.
    expect(onChange).not.toHaveBeenCalled();
  });

  test('Ignores a visit type reassigned without a new key', async () => {
    const onChange = vi.fn();
    const { rerender } = setup({ onChange, defaultValue: UltrasoundImagingService });
    await screen.findByText('Ultrasound Imaging');

    rerender(<AppointmentServiceSelect defaultValue={BARIATRIC_SURGERY} onChange={onChange} />);
    await settleAutocomplete();

    // The contract the prop name promises: read once, at mount.
    expect(screen.getByText('Ultrasound Imaging')).toBeInTheDocument();
    expect(screen.queryByText('Bariatric Surgery')).not.toBeInTheDocument();
  });
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { RenderResult } from '@testing-library/react';
import { MainClinic, SatelliteClinic, SchedulingFixtures, UltrasoundImagingService } from '../stories/scheduling';
import {
  clickAutocompleteOption,
  installAutocompleteTimers,
  settleAutocomplete,
  typeInAutocomplete,
} from '../test-utils/asyncAutocomplete';
import { renderWithMedplum, screen, waitFor } from '../test-utils/render';
import type { AppointmentServiceSelectProps } from './AppointmentServiceSelect';
import { AppointmentServiceSelect } from './AppointmentServiceSelect';

const medplum = new MockClient();

/** A second schedulable visit type, for reassigning the field to. */
const BARIATRIC_SURGERY: WithId<HealthcareService> = {
  ...UltrasoundImagingService,
  id: 'bariatric-surgery',
  name: 'Bariatric Surgery',
};

function setup(props: Partial<AppointmentServiceSelectProps> = {}, key?: string): RenderResult {
  return renderWithMedplum(<AppointmentServiceSelect key={key} onChange={vi.fn()} {...props} />, medplum);
}

function searchBox(): HTMLElement {
  return screen.getByPlaceholderText('Search visit types');
}

describe('AppointmentServiceSelect', () => {
  beforeAll(async () => {
    for (const resource of SchedulingFixtures) {
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

  test('Leaves the ordering to the server, so the filter never reshuffles the list', async () => {
    const searchResources = vi.spyOn(medplum, 'searchResources');
    setup();

    await typeInAutocomplete(searchBox(), 'Ultrasound');

    const serviceSearch = searchResources.mock.calls.find((call) => call[0] === 'HealthcareService');
    expect((serviceSearch?.[1] as URLSearchParams).get('_sort')).toBe('name');
    searchResources.mockRestore();
  });

  test('Narrows the services to a chosen location', async () => {
    const searchResources = vi.spyOn(medplum, 'searchResources');
    setup({ location: MainClinic });

    await typeInAutocomplete(searchBox(), 'Ultrasound');

    const serviceSearch = searchResources.mock.calls.find((call) => call[0] === 'HealthcareService');
    expect((serviceSearch?.[1] as URLSearchParams).get('location')).toBe('Location/main-clinic');
    expect(screen.getByText(/Showing visit types offered at/)).toBeInTheDocument();
    searchResources.mockRestore();
  });

  // A caller holding a reference should not have to read the Location first: narrowing
  // needs only the reference string, and the site is fetched to name it.
  test('Narrows the services to a location given as a reference', async () => {
    const searchResources = vi.spyOn(medplum, 'searchResources');
    setup({ location: { reference: 'Location/main-clinic' } });

    await typeInAutocomplete(searchBox(), 'Ultrasound');

    const serviceSearch = searchResources.mock.calls.find((call) => call[0] === 'HealthcareService');
    expect((serviceSearch?.[1] as URLSearchParams).get('location')).toBe('Location/main-clinic');
    expect(await screen.findByText(`Showing visit types offered at ${MainClinic.name}.`)).toBeInTheDocument();
    searchResources.mockRestore();
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
      { onChange, defaultValue: UltrasoundImagingService, location: MainClinic },
      UltrasoundImagingService.id
    );
    await screen.findByText('Ultrasound Imaging');

    rerender(
      <AppointmentServiceSelect key="empty" defaultValue={undefined} onChange={onChange} location={SatelliteClinic} />
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

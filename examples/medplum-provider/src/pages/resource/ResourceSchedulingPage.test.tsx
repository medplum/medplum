// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { HealthcareService } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '../../test-utils/render';
import { SchedulingEncounterCodingURI } from '../../utils/scheduling';
import { ResourceSchedulingPage } from './ResourceSchedulingPage';

vi.mock('../../utils/notifications', () => ({
  showErrorNotification: vi.fn(),
}));

const AMB_CODING = {
  system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  code: 'AMB',
  display: 'ambulatory',
};

describe('ResourceSchedulingPage', () => {
  let medplum: MockClient;

  function setup(url: string): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/:resourceType/:id/scheduling" element={<ResourceSchedulingPage />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  test('shows unsupported resource type alert for non-HealthcareService', async () => {
    await medplum.createResource({ resourceType: 'Patient', id: 'p-1' });
    setup('/Patient/p-1/scheduling');
    expect(await screen.findByText('Unsupported resource type')).toBeInTheDocument();
  });

  test('shows error alert when resource fails to load', async () => {
    setup('/HealthcareService/does-not-exist/scheduling');
    expect(await screen.findByRole('alert')).toHaveTextContent('Not found');
  });

  test('loading with no extensions', async () => {
    await medplum.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      id: 'svc-1',
      name: 'Primary Care',
    });
    setup('/HealthcareService/svc-1/scheduling');
    expect(await screen.findByText('Primary Care - Scheduling Configuration')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('Updating SchedulingEncounterCoding extension', async () => {
    await medplum.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      id: 'svc-ext',
      name: 'Test Service',
      extension: [{ url: SchedulingEncounterCodingURI, valueCoding: AMB_CODING }],
    });
    setup('/HealthcareService/svc-ext/scheduling');
    await screen.findByText('Test Service - Scheduling Configuration');

    const updateSpy = vi.spyOn(medplum, 'updateResource');

    // The existing coding shows as a pill (searchbox is hidden when a value is selected)
    expect(screen.getByText('ambulatory')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();

    // Saving without making changes preserves the existing extension
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    const firstSave = updateSpy.mock.calls[0][0] as HealthcareService;
    expect(firstSave.extension).toContainEqual(
      expect.objectContaining({ url: SchedulingEncounterCodingURI, valueCoding: AMB_CODING })
    );

    // Clear "ambulatory" and select a new coding.
    // MockClient always returns fixed test codes for any ValueSet/$expand call;
    await userEvent.click(screen.getByTitle('Clear all'));
    await userEvent.type(screen.getByRole('searchbox'), 'test');
    await userEvent.click(await screen.findByText('Test Display 2'));

    // Submit and verify the new coding was saved
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(2));
    const secondSave = updateSpy.mock.calls[1][0] as HealthcareService;
    const updatedExt = secondSave.extension?.find((e) => e.url === SchedulingEncounterCodingURI);
    expect(updatedExt?.valueCoding?.code).toBe('test-code-2');

    // Clear the field, submit — extension should be stripped
    await userEvent.click(screen.getByTitle('Clear all'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(3));
    const thirdSave = updateSpy.mock.calls[2][0] as HealthcareService;
    expect((thirdSave.extension ?? []).filter((e) => e.url === SchedulingEncounterCodingURI)).toHaveLength(0);

    // Submit again without touching the form — extension still absent
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(4));
    const fourthSave = updateSpy.mock.calls[3][0] as HealthcareService;
    expect((fourthSave.extension ?? []).filter((e) => e.url === SchedulingEncounterCodingURI)).toHaveLength(0);
  });
});

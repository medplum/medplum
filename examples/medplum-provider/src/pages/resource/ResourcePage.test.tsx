// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { HealthcareService } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, Loading, MedplumProvider } from '@medplum/react';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from '../../App';
import { act, render, screen } from '../../test-utils/render';

describe('ResourcePage', () => {
  async function setup(url: string, medplum = new MockClient()): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <MantineProvider>
              <Notifications />
              <ErrorBoundary>
                <Suspense fallback={<Loading />}>
                  <App />
                </Suspense>
              </ErrorBoundary>
            </MantineProvider>
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  test('Details tab renders', async () => {
    await setup('/Practitioner/123');
    expect((await screen.findAllByText('Name'))[0]).toBeInTheDocument();
    expect(screen.getByText('Gender')).toBeInTheDocument();
  });

  describe('Scheduling tab visibility', () => {
    let medplum: MockClient;

    beforeEach(() => {
      medplum = new MockClient();
      vi.clearAllMocks();
    });

    test('Scheduling tab appears for HealthcareService when scheduling feature is enabled', async () => {
      medplum.getProject = vi.fn().mockReturnValue({
        resourceType: 'Project',
        id: 'project-1',
        features: ['scheduling'],
      });
      const svc = await medplum.createResource<HealthcareService>({
        resourceType: 'HealthcareService',
        name: 'Test Service',
      });
      await setup(`/HealthcareService/${svc.id}`, medplum);
      expect(await screen.findByText('Scheduling')).toBeInTheDocument();
    });

    test('Scheduling tab is absent when scheduling feature is not enabled', async () => {
      medplum.getProject = vi.fn().mockReturnValue({
        resourceType: 'Project',
        id: 'project-1',
        features: [],
      });
      const svc = await medplum.createResource<HealthcareService>({
        resourceType: 'HealthcareService',
        name: 'Test Service',
      });
      await setup(`/HealthcareService/${svc.id}`, medplum);
      // Wait for the resource to load (Details tab is always present)
      await screen.findByText('Details');
      expect(screen.queryByText('Scheduling')).not.toBeInTheDocument();
    });

    test('Scheduling tab is absent for non-HealthcareService resource types even when feature is enabled', async () => {
      medplum.getProject = vi.fn().mockReturnValue({
        resourceType: 'Project',
        id: 'project-1',
        features: ['scheduling'],
      });
      await setup('/Practitioner/123', medplum);
      await screen.findByText('Details');
      expect(screen.queryByText('Scheduling')).not.toBeInTheDocument();
    });
  });
});

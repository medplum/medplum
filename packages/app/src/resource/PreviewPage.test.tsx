// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Questionnaire, ValueSet } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, Loading, MedplumProvider } from '@medplum/react';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../AppRoutes';
import { act, render, screen } from '../test-utils/render';

const medplum = new MockClient();

describe('PreviewPage', () => {
  async function setup(url: string): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <MantineProvider>
              <Notifications />
              <ErrorBoundary>
                <Suspense fallback={<Loading />}>
                  <AppRoutes />
                </Suspense>
              </ErrorBoundary>
            </MantineProvider>
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('ValueSet preview tab appears in ResourcePage', async () => {
    const valueSet = await medplum.createResource<ValueSet>({
      resourceType: 'ValueSet',
      status: 'active',
      url: 'http://example.com/valueset/test',
    });

    await setup(`/ValueSet/${valueSet.id}`);

    // Wait for the page to load and check for Preview tab
    expect(await screen.findByText('Preview')).toBeInTheDocument();
  });

  test('Questionnaire preview tab appears in ResourcePage', async () => {
    const questionnaire = await medplum.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      title: 'Test Questionnaire',
    });

    await setup(`/Questionnaire/${questionnaire.id}`);

    // Wait for the page to load and check for Preview tab
    expect(await screen.findByText('Preview')).toBeInTheDocument();
  });

  test('Navigates to preview tab', async () => {
    const valueSet = await medplum.createResource<ValueSet>({
      resourceType: 'ValueSet',
      status: 'active',
      url: 'http://example.com/valueset/test',
      expansion: {
        timestamp: '2023-01-01T00:00:00.000Z',
        contains: [
          {
            system: 'http://example.com/codesystem',
            code: 'code1',
            display: 'Display 1',
          },
        ],
      },
    });

    // Mock valueSetExpand
    medplum.valueSetExpand = jest.fn().mockResolvedValue(valueSet);

    await setup(`/ValueSet/${valueSet.id}`);

    const previewTab = await screen.findByText('Preview');
    expect(previewTab).toBeInTheDocument();

    await act(async () => {
      previewTab.click();
      jest.advanceTimersByTime(100);
    });

    // After clicking preview tab, should show the preview content
    expect(await screen.findByPlaceholderText('Select a value from the ValueSet')).toBeInTheDocument();
  });
});

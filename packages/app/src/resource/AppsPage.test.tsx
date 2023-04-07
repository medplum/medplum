import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { Loading } from '../components/Loading';

describe('AppsPage', () => {
  async function setup(url: string, medplum = new MockClient()): Promise<void> {
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

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  test('No apps found', async () => {
    await setup('/Bot/123/apps');
    await waitFor(() => screen.getByText('No apps found.', { exact: false }));

    expect(screen.getByText('No apps found.', { exact: false })).toBeInTheDocument();
  });

  test('Patient apps', async () => {
    await setup('/Patient/123/apps');
    await waitFor(() => screen.getByText('Apps'));

    expect(screen.getByText('Apps')).toBeInTheDocument();
    expect(screen.getByText('Vitals')).toBeInTheDocument();
  });

  test('Patient Smart App Launch', async () => {
    global.window = Object.create(window);
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/Patient/123/apps',
        assign: jest.fn(),
      },
      writable: true,
    });

    await setup('/Patient/123/apps');
    await waitFor(() => screen.getByText('Apps'));

    expect(screen.getByText('Inferno Client')).toBeInTheDocument();
    expect(screen.getByText('Client application used for Inferno ONC compliance testing')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Inferno Client'));
    });

    expect(window.location.assign).toBeCalled();
  });

  test('Encounter Smart App Launch', async () => {
    global.window = Object.create(window);
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/Encounter/123/apps',
        assign: jest.fn(),
      },
      writable: true,
    });

    await setup('/Encounter/123/apps');
    await waitFor(() => screen.getByText('Apps'));

    expect(screen.getByText('Inferno Client')).toBeInTheDocument();
    expect(screen.getByText('Client application used for Inferno ONC compliance testing')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Inferno Client'));
    });

    expect(window.location.assign).toBeCalled();
  });
});

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { Loading } from '../components/Loading';

describe('JsonPage', () => {
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

  test('JSON tab renders', async () => {
    await setup('/Practitioner/123/json');
    await waitFor(() => screen.getByTestId('resource-json'));

    expect(screen.getByTestId('resource-json')).toBeInTheDocument();
  });

  test('JSON submit', async () => {
    await setup('/Practitioner/123/json');
    await waitFor(() => screen.getByTestId('resource-json'));

    await act(async () => {
      fireEvent.change(screen.getByTestId('resource-json'), {
        target: { value: '{"resourceType":"Practitioner","id":"123"}' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  test('JSON submit with meta', async () => {
    await setup('/Practitioner/123/json');
    await waitFor(() => screen.getByTestId('resource-json'));

    await act(async () => {
      fireEvent.change(screen.getByTestId('resource-json'), {
        target: {
          value: JSON.stringify({
            resourceType: 'Practitioner',
            id: '123',
            meta: {
              lastUpdated: '2020-01-01T00:00:00.000Z',
              author: {
                reference: 'Practitioner/111',
              },
            },
          }),
        },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(screen.getByText('Success')).toBeInTheDocument();
  });
});

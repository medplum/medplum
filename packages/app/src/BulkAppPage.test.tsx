import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './AppRoutes';

const medplum = new MockClient();

describe('ResourcePage', () => {
  async function setup(url: string): Promise<void> {
    const urlObj = new URL(url, 'http://localhost');
    Object.defineProperty(window, 'location', {
      value: {
        href: urlObj.href,
        search: urlObj.search,
      },
    });
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <AppRoutes />
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  test('Patient apps', async () => {
    await setup('/bulk/Patient?ids=123,456');
    await waitFor(() => screen.getByText('Vitals'));
    expect(screen.getByText('Vitals')).toBeInTheDocument();
  });

  test('No apps for resource type', async () => {
    await setup('/bulk/DeviceDefinition?ids=123');
    await waitFor(() => screen.getByText('No apps for DeviceDefinition'));
    expect(screen.getByText('No apps for DeviceDefinition')).toBeInTheDocument();
  });

  test('No query params', async () => {
    await setup('/bulk/Patient');
    await waitFor(() => screen.getByText('Vitals'));
    expect(screen.getByText('Vitals')).toBeInTheDocument();
  });

  test('Empty IDs', async () => {
    await setup('/bulk/Patient?ids=123,,,');
    await waitFor(() => screen.getByText('Vitals'));
    expect(screen.getByText('Vitals')).toBeInTheDocument();
  });
});

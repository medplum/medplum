import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './AppRoutes';
import { act, render, screen } from './test-utils/render';

const medplum = new MockClient();

describe('BulkAppPage', () => {
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
    expect(await screen.findByText('Vitals')).toBeInTheDocument();
  });

  test('No apps for resource type', async () => {
    await setup('/bulk/DeviceDefinition?ids=123');
    expect(await screen.findByText('No apps for DeviceDefinition')).toBeInTheDocument();
  });

  test('No query params', async () => {
    await setup('/bulk/Patient');
    expect(await screen.findByText('Vitals')).toBeInTheDocument();
  });

  test('Empty IDs', async () => {
    await setup('/bulk/Patient?ids=123,,,');
    expect(await screen.findByText('Vitals')).toBeInTheDocument();
  });
});

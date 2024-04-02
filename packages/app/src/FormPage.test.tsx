import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './AppRoutes';
import { act, fireEvent, render, screen } from './test-utils/render';

const medplum = new MockClient();

describe('FormPage', () => {
  async function setup(url: string): Promise<void> {
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

  test('Not found', async () => {
    await setup('/forms/not-found');
    expect(await screen.findByTestId('error')).toBeInTheDocument();
  });

  test('Form renders', async () => {
    await setup('/forms/123');
    expect(await screen.findByText('First question')).toBeInTheDocument();
  });

  test('Submit', async () => {
    await setup('/forms/123');
    expect(await screen.findByText('First question')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(screen.queryByText('First question')).not.toBeInTheDocument();
  });

  test('Patient subject', async () => {
    await setup('/forms/123?subject=Patient/123&');
    expect(await screen.findByText('First question')).toBeInTheDocument();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });
  });

  test('ServiceRequest subject', async () => {
    await setup('/forms/123?subject=ServiceRequest/123');
    expect(await screen.findByText('First question')).toBeInTheDocument();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Multiple subjects', async () => {
    await setup('/forms/123?subject=ServiceRequest/123,ServiceRequest/456');
    expect(await screen.findByText('First question')).toBeInTheDocument();
    expect(screen.getByText('Vitals (for 2 resources)')).toBeInTheDocument();
    expect(screen.queryByText('Homer Simpson')).not.toBeInTheDocument();
  });
});

import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';

const medplum = new MockClient();

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

describe('CreateClientPage', () => {
  beforeAll(() => {
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: {
        reference: 'Practitioner/123',
      },
      project: {
        reference: 'Project/123',
      },
    });
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders', async () => {
    await setup('/admin/clients/new');
    await waitFor(() => screen.getByText('Create Client'));
    expect(screen.getByText('Create Client')).toBeInTheDocument();
  });

  test('Submit success', async () => {
    await setup('/admin/clients/new');
    await waitFor(() => screen.getByText('Create Client'));

    expect(screen.getByText('Create Client')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'Test Client' },
      });
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Test Description' },
      });
      fireEvent.change(screen.getByLabelText('Redirect URI'), {
        target: { value: 'https://example.com/' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Create Client'));
    });

    expect(screen.getByText('Client created')).toBeInTheDocument();
  });

  test('Submit with access policy', async () => {
    await setup('/admin/clients/new');
    await waitFor(() => screen.getByText('Create Client'));

    expect(screen.getByText('Create Client')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'Test Client' },
      });
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Test Description' },
      });
      fireEvent.change(screen.getByLabelText('Redirect URI'), {
        target: { value: 'https://example.com/' },
      });
    });

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    // Enter "Example Access Policy"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Example Access Policy' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Create Client'));
    });

    expect(screen.getByText('Client created')).toBeInTheDocument();
  });
});

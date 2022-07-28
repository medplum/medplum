import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CreateClientPage } from './CreateClientPage';

const medplum = new MockClient();

async function setup(url: string): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Routes>
            <Route path="/admin/project/client" element={<CreateClientPage />} />
          </Routes>
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
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders', async () => {
    await setup('/admin/project/client');
    await waitFor(() => screen.getByText('Create Client'));
    expect(screen.getByText('Create Client')).toBeInTheDocument();
  });

  test('Submit success', async () => {
    await setup('/admin/project/client');
    await waitFor(() => screen.getByText('Create Client'));

    expect(screen.getByText('Create Client')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByTestId('name'), {
        target: { value: 'Test Client' },
      });
      fireEvent.change(screen.getByTestId('description'), {
        target: { value: 'Test Description' },
      });
      fireEvent.change(screen.getByTestId('redirectUri'), {
        target: { value: 'https://example.com/' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Create Client'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Submit with access policy', async () => {
    await setup('/admin/project/client');
    await waitFor(() => screen.getByText('Create Client'));

    expect(screen.getByText('Create Client')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByTestId('name'), {
        target: { value: 'Test Client' },
      });
      fireEvent.change(screen.getByTestId('description'), {
        target: { value: 'Test Description' },
      });
      fireEvent.change(screen.getByTestId('redirectUri'), {
        target: { value: 'https://example.com/' },
      });
    });

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter "Example Access Policy"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Example Access Policy' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => screen.getByTestId('dropdown'));

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Create Client'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });
});

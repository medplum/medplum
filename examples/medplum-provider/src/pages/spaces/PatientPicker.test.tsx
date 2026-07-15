// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider, Menu } from '@mantine/core';
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PatientPicker } from './PatientPicker';

vi.mock('../../utils/notifications', () => ({
  showErrorNotification: vi.fn(),
}));

const homer: Patient = { resourceType: 'Patient', id: 'p-homer', name: [{ given: ['Homer'], family: 'Simpson' }] };
const marge: Patient = { resourceType: 'Patient', id: 'p-marge', name: [{ given: ['Marge'], family: 'Simpson' }] };

describe('PatientPicker', () => {
  let medplum: MockClient;
  let searchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    medplum = new MockClient();
    searchSpy = vi.fn().mockResolvedValue([homer, marge]);
    medplum.searchResources = searchSpy as unknown as typeof medplum.searchResources;
  });

  function setup(props: Partial<Parameters<typeof PatientPicker>[0]> = {}): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Menu opened>
              <PatientPicker onSelect={vi.fn()} {...props} />
            </Menu>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('lists patients and calls onSelect when one is clicked', async () => {
    const onSelect = vi.fn();
    await act(async () => setup({ onSelect }));

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Marge Simpson')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Homer Simpson'));
    expect(onSelect).toHaveBeenCalledWith(homer);
  });

  test('shows empty state when no patients are returned', async () => {
    searchSpy.mockResolvedValue([]);
    await act(async () => setup());

    expect(await screen.findByText(/no patients found/i)).toBeInTheDocument();
  });

  test('searches by name as the user types', async () => {
    await act(async () => setup());
    await screen.findByText('Homer Simpson');

    const input = screen.getByPlaceholderText('Search patients...');
    fireEvent.change(input, { target: { value: 'Marge' } });

    await waitFor(() => {
      const searchedByName = searchSpy.mock.calls.some(
        ([, params]) => params instanceof URLSearchParams && params.get('name') === 'Marge'
      );
      expect(searchedByName).toBe(true);
    });
  });

  test('surfaces an error notification when the search fails', async () => {
    const { showErrorNotification } = await import('../../utils/notifications');
    const error = new Error('network down');
    searchSpy.mockRejectedValueOnce(error);
    await act(async () => setup());

    await waitFor(() => {
      expect(showErrorNotification).toHaveBeenCalledWith(error);
    });
    expect(await screen.findByText(/no patients found/i)).toBeInTheDocument();
  });
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Practitioner, Patient, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { ParticipantFilter } from './ParticipantFilter';
import type { WithId } from '@medplum/core';

const mockPractitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: 'practitioner-123',
  name: [{ given: ['John'], family: 'Doe' }],
};

const mockPatient: Patient = {
  resourceType: 'Patient',
  id: 'patient-456',
  name: [{ given: ['Jane'], family: 'Smith' }],
};

const mockOnFilterChange = vi.fn();

describe('ParticipantFilter', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();

    medplum.setProfile(mockPractitioner);
  });

  const setup = async (
    selectedParticipants: Reference<Patient | Practitioner>[] = []
  ): Promise<ReturnType<typeof userEvent.setup>> => {
    const user = userEvent.setup();
    await act(async () => {
      render(
        <MantineProvider>
          <MedplumProvider medplum={medplum}>
            <ParticipantFilter selectedParticipants={selectedParticipants} onFilterChange={mockOnFilterChange} />
          </MedplumProvider>
        </MantineProvider>
      );
    });
    return user;
  };

  test('renders participant filter button', async () => {
    await setup();
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  test('button shows light variant when no filter is active', async () => {
    await setup([]);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('data-variant', 'light');
  });

  test('button shows filled variant when filter is active', async () => {
    await setup([{ reference: 'Patient/patient-456', display: 'Jane Smith' }]);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('data-variant', 'filled');
  });

  test('opens popover when button is clicked', async () => {
    const user = await setup();

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Message Participants')).toBeInTheDocument();
    });
  });

  test('shows current user at the top of the list', async () => {
    const user = await setup();

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
      expect(screen.getByText('(you)')).toBeInTheDocument();
    });
  });

  test('current user is not selected by default when no filter active', async () => {
    const user = await setup([]);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[0]).not.toBeChecked();
    });
  });

  test('current user is selected when in selectedParticipants', async () => {
    const user = await setup([{ reference: 'Practitioner/practitioner-123', display: 'John Doe' }]);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[0]).toBeChecked();
    });
  });

  test('calls onFilterChange when participant is selected', async () => {
    const user = await setup([]);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBeGreaterThan(0);
    });

    const checkbox = document.querySelectorAll('input[type="checkbox"]')[0];
    await user.click(checkbox);

    expect(mockOnFilterChange).toHaveBeenCalledWith([
      { reference: 'Practitioner/practitioner-123', display: 'John Doe' },
    ]);
  });

  test('calls onFilterChange when participant is deselected', async () => {
    const user = await setup([{ reference: 'Practitioner/practitioner-123', display: 'John Doe' }]);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
      const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
      expect(checkboxes[0]?.checked).toBe(true);
    });

    const checkbox = document.querySelectorAll('input[type="checkbox"]')[0];
    await user.click(checkbox);

    expect(mockOnFilterChange).toHaveBeenCalledWith([]);
  });

  test('shows search input with placeholder', async () => {
    const user = await setup();

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText('Search for a Patient or Practitioner...');
      expect(searchInput).toBeInTheDocument();
    });
  });

  test('search input is available when popover opens', async () => {
    const user = await setup();

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Message Participants')).toBeInTheDocument();
      const searchInput = screen.getByPlaceholderText('Search for a Patient or Practitioner...');
      expect(searchInput).toBeInTheDocument();
    });
  });

  test('searches for participants when typing in search input', async () => {
    const searchSpy = vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockPatient as WithId<Patient> }],
    });
    const user = await setup();

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Message Participants')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search for a Patient or Practitioner...');
    await user.type(searchInput, 'Jane');

    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalledWith('Patient', {
        _type: 'Patient,Practitioner',
        name: 'Jane',
        _count: '10',
      });
    });
  });

  test('displays search results', async () => {
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockPatient as WithId<Patient> }],
    });
    const user = await setup();

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Message Participants')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search for a Patient or Practitioner...');
    await user.type(searchInput, 'Jane');

    await waitFor(() => {
      expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
    });
  });

  test('filters out current user from search results', async () => {
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockPractitioner as WithId<Practitioner> }],
    });
    const user = await setup();

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Message Participants')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search for a Patient or Practitioner...');
    await user.type(searchInput, 'John');

    await waitFor(() => {
      const johnDoeElements = screen.getAllByText(/John Doe/);
      expect(johnDoeElements).toHaveLength(1);
    });
  });

  test('shows "No results found" when search returns empty', async () => {
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [],
    });
    const user = await setup();

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Message Participants')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search for a Patient or Practitioner...');
    await user.type(searchInput, 'nonexistent');

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });
  });

  test('clears search input when clear button is clicked', async () => {
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockPatient as WithId<Patient> }],
    });
    const user = await setup();

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Message Participants')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search for a Patient or Practitioner...');
    await user.type(searchInput, 'Jane');

    await waitFor(() => {
      expect(searchInput).toHaveValue('Jane');
    });

    await user.clear(searchInput);

    await waitFor(() => {
      expect(searchInput).toHaveValue('');
    });
  });

  test('selecting a search result calls onFilterChange', async () => {
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockPatient as WithId<Patient> }],
    });
    const user = await setup([]);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Message Participants')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search for a Patient or Practitioner...');
    await user.type(searchInput, 'Jane');

    await waitFor(() => {
      expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBeGreaterThan(1);
    });

    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    await user.click(checkboxes[1]);

    expect(mockOnFilterChange).toHaveBeenCalledWith([{ reference: 'Patient/patient-456', display: 'Jane Smith' }]);
  });

  test('shows additional participants from props', async () => {
    const user = await setup([{ reference: 'Patient/patient-456', display: 'Jane Smith' }]);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
    });
  });

  test('multiple participants can be selected', async () => {
    const user = await setup([
      { reference: 'Practitioner/practitioner-123', display: 'John Doe' },
      { reference: 'Patient/patient-456', display: 'Jane Smith' },
    ]);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[0]).toBeChecked();
      expect(checkboxes[1]).toBeChecked();
    });
  });

  test('removes participant when X button is clicked', async () => {
    const user = await setup([{ reference: 'Patient/patient-456', display: 'Jane Smith' }]);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
    });

    const closeButtons = document.querySelectorAll('button[class*="CloseButton"]');
    expect(closeButtons.length).toBeGreaterThan(0);
    const participantCloseButton = closeButtons[closeButtons.length - 1];
    await user.click(participantCloseButton);

    expect(mockOnFilterChange).toHaveBeenCalledWith([]);
  });

  test('clears search when clear button is clicked', async () => {
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockPatient as WithId<Patient> }],
    });
    const user = await setup();

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Message Participants')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search for a Patient or Practitioner...');
    await user.type(searchInput, 'Jane');

    await waitFor(() => {
      expect(searchInput).toHaveValue('Jane');
    });

    const inputWrapper = searchInput.closest('.mantine-TextInput-root');
    const clearButton = inputWrapper?.querySelector('button[class*="CloseButton"]');
    expect(clearButton).toBeInTheDocument();
    await user.click(clearButton as Element);

    await waitFor(() => {
      expect(searchInput).toHaveValue('');
    });
  });

  test('closes popover when clicking outside', async () => {
    const user = await setup();

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Message Participants')).toBeInTheDocument();
    });

    await user.click(document.body);

    await waitFor(() => {
      expect(screen.queryByText('Message Participants')).not.toBeInTheDocument();
    });
  });

  test('handles no profile (logged out state)', async () => {
    medplum.setProfile(undefined as unknown as Practitioner);

    const user = await setup();

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Message Participants')).toBeInTheDocument();
    });

    expect(screen.queryByText('(you)')).not.toBeInTheDocument();
  });

  test('shows participant reference when display is not available', async () => {
    const user = await setup([{ reference: 'Patient/unknown-patient' }]);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Patient/unknown-patient')).toBeInTheDocument();
    });
  });

  test('handles search error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(medplum, 'search').mockRejectedValue(new Error('Search failed'));
    const user = await setup();

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Message Participants')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search for a Patient or Practitioner...');
    await user.type(searchInput, 'test');

    await waitFor(() => {
      expect(medplum.search).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  test('handles search results with undefined resources', async () => {
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockPatient as WithId<Patient> }, { resource: undefined as unknown as WithId<Patient> }, {}],
    });
    const user = await setup();

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Message Participants')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search for a Patient or Practitioner...');
    await user.type(searchInput, 'test');

    await waitFor(() => {
      expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
    });
  });

  test('handles empty search query', async () => {
    const searchSpy = vi.spyOn(medplum, 'search');
    const user = await setup();

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Message Participants')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search for a Patient or Practitioner...');

    await user.type(searchInput, '   ');

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 400);
    });

    expect(searchSpy).not.toHaveBeenCalled();
  });
});

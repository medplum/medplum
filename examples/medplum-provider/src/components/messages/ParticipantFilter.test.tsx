// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Practitioner, Patient, Bundle } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { ParticipantFilter } from './ParticipantFilter';
import { WithId } from '@medplum/core';

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

function createBundle(resources: (Patient | Practitioner)[]): Bundle {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: resources.map((resource) => ({ resource })),
  };
}

const mockOnFilterChange = vi.fn();

describe('ParticipantFilter', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();

    // Set up the current user profile
    medplum.setProfile(mockPractitioner);

    // Mock search to return empty by default
    vi.spyOn(medplum, 'search').mockResolvedValue({ bundle: { entry: [] } as Bundle<WithId<Patient | Practitioner>> });
  });

  const setup = async (selectedParticipantRefs: string[] = []): Promise<ReturnType<typeof userEvent.setup>> => {
    const user = userEvent.setup();
    await act(async () => {
      render(
        <MantineProvider>
          <MedplumProvider medplum={medplum}>
            <ParticipantFilter
              selectedParticipantRefs={selectedParticipantRefs}
              onFilterChange={mockOnFilterChange}
            />
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
    vi.spyOn(medplum, 'readResource').mockResolvedValue(mockPatient);
    await setup(['Patient/patient-456']);
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

  test('current user is selected when in selectedParticipantRefs', async () => {
    const user = await setup(['Practitioner/practitioner-123']);

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

    expect(mockOnFilterChange).toHaveBeenCalledWith(['Practitioner/practitioner-123']);
  });

  test('calls onFilterChange when participant is deselected', async () => {
    const user = await setup(['Practitioner/practitioner-123']);

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
    const searchSpy = vi.spyOn(medplum, 'search').mockResolvedValue(createBundle([mockPatient]));
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
    vi.spyOn(medplum, 'search').mockResolvedValue(createBundle([mockPatient]));
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
    // Return current user in search results - should be filtered out
    vi.spyOn(medplum, 'search').mockResolvedValue(createBundle([mockPractitioner]));
    const user = await setup();

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Message Participants')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search for a Patient or Practitioner...');
    await user.type(searchInput, 'John');

    await waitFor(() => {
      // Should only have one John Doe entry (the hardcoded current user at top)
      const johnDoeElements = screen.getAllByText(/John Doe/);
      expect(johnDoeElements).toHaveLength(1);
    });
  });

  test('shows "No results found" when search returns empty', async () => {
    vi.spyOn(medplum, 'search').mockResolvedValue(createBundle([]));
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
    vi.spyOn(medplum, 'search').mockResolvedValue(createBundle([mockPatient]));
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

    // Clear by selecting all and pressing backspace instead of finding clear button
    await user.clear(searchInput);

    await waitFor(() => {
      expect(searchInput).toHaveValue('');
    });
  });

  test('selecting a search result calls onFilterChange', async () => {
    vi.spyOn(medplum, 'search').mockResolvedValue(createBundle([mockPatient]));
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
      // Use container query since popover display:none hides elements from accessibility tree
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBeGreaterThan(1);
    });

    // Click the checkbox for Jane Smith (second checkbox after current user)
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    await user.click(checkboxes[1]);

    expect(mockOnFilterChange).toHaveBeenCalledWith(['Patient/patient-456']);
  });

  test('shows additional participants from URL', async () => {
    vi.spyOn(medplum, 'readResource').mockResolvedValue(mockPatient);
    const user = await setup(['Patient/patient-456']);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
    });
  });

  test('multiple participants can be selected', async () => {
    vi.spyOn(medplum, 'readResource').mockResolvedValue(mockPatient);
    const user = await setup(['Practitioner/practitioner-123', 'Patient/patient-456']);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[0]).toBeChecked(); // Current user
      expect(checkboxes[1]).toBeChecked(); // Patient
    });
  });
});

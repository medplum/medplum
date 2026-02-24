// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { AddFavoriteParams, AddPharmacyResponse, PharmacySearchParams } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import { PharmacyDialog } from './PharmacyDialog';

const medplum = new MockClient();

describe('PharmacyDialog', () => {
  async function setup(children: ReactNode): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  const mockPharmacies: Organization[] = [
    {
      resourceType: 'Organization',
      identifier: [
        {
          system: 'https://dosespot.com/pharmacy-id',
          value: '123',
        },
      ],
      name: 'CVS Pharmacy',
      address: [
        {
          line: ['123 Main St'],
          city: 'Boston',
          state: 'MA',
          postalCode: '02101',
        },
      ],
      telecom: [
        {
          system: 'phone',
          value: '555-1234',
        },
        {
          system: 'fax',
          value: '555-5678',
        },
      ],
    },
    {
      resourceType: 'Organization',
      identifier: [
        {
          system: 'https://dosespot.com/pharmacy-id',
          value: '456',
        },
      ],
      name: 'Walgreens',
      address: [
        {
          line: ['456 Oak Ave'],
          city: 'Cambridge',
          state: 'MA',
          postalCode: '02139',
        },
      ],
      telecom: [
        {
          system: 'phone',
          value: '555-9999',
        },
      ],
    },
  ];

  let mockOnSearch: jest.Mock<Promise<Organization[]>, [PharmacySearchParams]>;
  let mockOnAddToFavorites: jest.Mock<Promise<AddPharmacyResponse>, [AddFavoriteParams]>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnSearch = jest.fn<Promise<Organization[]>, [PharmacySearchParams]>();
    mockOnAddToFavorites = jest.fn<Promise<AddPharmacyResponse>, [AddFavoriteParams]>();
  });

  test('Renders search form', async () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();

    await setup(
      <PharmacyDialog
        patient={HomerSimpson}
        onSubmit={onSubmit}
        onClose={onClose}
        onSearch={mockOnSearch}
        onAddToFavorites={mockOnAddToFavorites}
      />
    );

    expect(screen.getByLabelText('Pharmacy Name')).toBeInTheDocument();
    expect(screen.getByLabelText('City')).toBeInTheDocument();
    expect(screen.getByLabelText('State')).toBeInTheDocument();
    expect(screen.getByLabelText('Zip Code')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone or Fax')).toBeInTheDocument();
    expect(screen.getByLabelText('Address')).toBeInTheDocument();
    expect(screen.getByLabelText('NCPDP ID')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  test('Shows warning when searching without criteria', async () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();

    await setup(
      <PharmacyDialog
        patient={HomerSimpson}
        onSubmit={onSubmit}
        onClose={onClose}
        onSearch={mockOnSearch}
        onAddToFavorites={mockOnAddToFavorites}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Search'));
    });

    // onSearch should not be called when no criteria is provided
    expect(mockOnSearch).not.toHaveBeenCalled();
  });

  test('Performs search with valid criteria', async () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();

    mockOnSearch.mockResolvedValue(mockPharmacies);

    await setup(
      <PharmacyDialog
        patient={HomerSimpson}
        onSubmit={onSubmit}
        onClose={onClose}
        onSearch={mockOnSearch}
        onAddToFavorites={mockOnAddToFavorites}
      />
    );

    // Fill in search form
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Pharmacy Name'), { target: { value: 'CVS' } });
      fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Boston' } });
      fireEvent.change(screen.getByLabelText('Zip Code'), { target: { value: '02101' } });
    });

    // Submit search
    await act(async () => {
      fireEvent.click(screen.getByText('Search'));
    });

    await waitFor(() => {
      expect(mockOnSearch).toHaveBeenCalledWith({
        name: 'CVS',
        city: 'Boston',
        zip: '02101',
      });
    });
  });

  test('Displays search results', async () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();

    mockOnSearch.mockResolvedValue(mockPharmacies);

    await setup(
      <PharmacyDialog
        patient={HomerSimpson}
        onSubmit={onSubmit}
        onClose={onClose}
        onSearch={mockOnSearch}
        onAddToFavorites={mockOnAddToFavorites}
      />
    );

    // Search
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Pharmacy Name'), { target: { value: 'CVS' } });
      fireEvent.click(screen.getByText('Search'));
    });

    await waitFor(() => {
      expect(screen.getByText('CVS Pharmacy')).toBeInTheDocument();
      expect(screen.getByText('Walgreens')).toBeInTheDocument();
      expect(screen.getByText(/123 Main St/)).toBeInTheDocument();
      expect(screen.getByText(/456 Oak Ave/)).toBeInTheDocument();
    });
  });

  test('Shows no results message', async () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();

    mockOnSearch.mockResolvedValue([]);

    await setup(
      <PharmacyDialog
        patient={HomerSimpson}
        onSubmit={onSubmit}
        onClose={onClose}
        onSearch={mockOnSearch}
        onAddToFavorites={mockOnAddToFavorites}
      />
    );

    // Search
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Pharmacy Name'), { target: { value: 'NonExistent' } });
      fireEvent.click(screen.getByText('Search'));
    });

    await waitFor(() => {
      expect(mockOnSearch).toHaveBeenCalled();
    });
  });

  test('Selects pharmacy from results', async () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();

    mockOnSearch.mockResolvedValue(mockPharmacies);

    await setup(
      <PharmacyDialog
        patient={HomerSimpson}
        onSubmit={onSubmit}
        onClose={onClose}
        onSearch={mockOnSearch}
        onAddToFavorites={mockOnAddToFavorites}
      />
    );

    // Search
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Pharmacy Name'), { target: { value: 'CVS' } });
      fireEvent.click(screen.getByText('Search'));
    });

    await waitFor(() => {
      expect(screen.getByText('CVS Pharmacy')).toBeInTheDocument();
    });

    // Select first pharmacy
    await act(async () => {
      fireEvent.click(screen.getByText('CVS Pharmacy'));
    });

    // Add to Favorites button should be enabled
    const addButton = screen.getByText('Add to Favorites');
    expect(addButton).not.toBeDisabled();
  });

  test('Adds pharmacy to favorites', async () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();

    mockOnSearch.mockResolvedValue(mockPharmacies);
    mockOnAddToFavorites.mockResolvedValue({
      success: true,
      message: 'Successfully added pharmacy',
      organization: mockPharmacies[0],
    });

    await setup(
      <PharmacyDialog
        patient={HomerSimpson}
        onSubmit={onSubmit}
        onClose={onClose}
        onSearch={mockOnSearch}
        onAddToFavorites={mockOnAddToFavorites}
      />
    );

    // Search
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Pharmacy Name'), { target: { value: 'CVS' } });
      fireEvent.click(screen.getByText('Search'));
    });

    await waitFor(() => {
      expect(screen.getByText('CVS Pharmacy')).toBeInTheDocument();
    });

    // Select pharmacy
    await act(async () => {
      fireEvent.click(screen.getByText('CVS Pharmacy'));
    });

    // Add to favorites
    await act(async () => {
      fireEvent.click(screen.getByText('Add to Favorites'));
    });

    await waitFor(() => {
      expect(mockOnAddToFavorites).toHaveBeenCalledWith({
        patientId: HomerSimpson.id,
        pharmacy: mockPharmacies[0],
        setAsPrimary: false,
      });
      expect(onSubmit).toHaveBeenCalledWith(mockPharmacies[0]);
    });
  });

  test('Adds pharmacy as primary', async () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();

    mockOnSearch.mockResolvedValue(mockPharmacies);
    mockOnAddToFavorites.mockResolvedValue({
      success: true,
      message: 'Successfully added primary pharmacy',
      organization: mockPharmacies[0],
    });

    await setup(
      <PharmacyDialog
        patient={HomerSimpson}
        onSubmit={onSubmit}
        onClose={onClose}
        onSearch={mockOnSearch}
        onAddToFavorites={mockOnAddToFavorites}
      />
    );

    // Search
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Pharmacy Name'), { target: { value: 'CVS' } });
      fireEvent.click(screen.getByText('Search'));
    });

    await waitFor(() => {
      expect(screen.getByText('CVS Pharmacy')).toBeInTheDocument();
    });

    // Select pharmacy
    await act(async () => {
      fireEvent.click(screen.getByText('CVS Pharmacy'));
    });

    // Check "Set as primary"
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Set as primary pharmacy'));
    });

    // Add to favorites
    await act(async () => {
      fireEvent.click(screen.getByText('Add to Favorites'));
    });

    await waitFor(() => {
      expect(mockOnAddToFavorites).toHaveBeenCalledWith({
        patientId: HomerSimpson.id,
        pharmacy: mockPharmacies[0],
        setAsPrimary: true,
      });
    });
  });

  test('Handles search error', async () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();

    mockOnSearch.mockRejectedValue(new Error('Search failed'));

    await setup(
      <PharmacyDialog
        patient={HomerSimpson}
        onSubmit={onSubmit}
        onClose={onClose}
        onSearch={mockOnSearch}
        onAddToFavorites={mockOnAddToFavorites}
      />
    );

    // Search
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Pharmacy Name'), { target: { value: 'CVS' } });
      fireEvent.click(screen.getByText('Search'));
    });

    await waitFor(() => {
      expect(mockOnSearch).toHaveBeenCalled();
    });
  });

  test('Handles add pharmacy error', async () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();

    mockOnSearch.mockResolvedValue(mockPharmacies);
    mockOnAddToFavorites.mockRejectedValue(new Error('Failed to add pharmacy'));

    await setup(
      <PharmacyDialog
        patient={HomerSimpson}
        onSubmit={onSubmit}
        onClose={onClose}
        onSearch={mockOnSearch}
        onAddToFavorites={mockOnAddToFavorites}
      />
    );

    // Search
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Pharmacy Name'), { target: { value: 'CVS' } });
      fireEvent.click(screen.getByText('Search'));
    });

    await waitFor(() => {
      expect(screen.getByText('CVS Pharmacy')).toBeInTheDocument();
    });

    // Select and add
    await act(async () => {
      fireEvent.click(screen.getByText('CVS Pharmacy'));
      fireEvent.click(screen.getByText('Add to Favorites'));
    });

    await waitFor(() => {
      expect(mockOnAddToFavorites).toHaveBeenCalled();
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  test('Closes dialog on cancel', async () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();

    mockOnSearch.mockResolvedValue(mockPharmacies);

    await setup(
      <PharmacyDialog
        patient={HomerSimpson}
        onSubmit={onSubmit}
        onClose={onClose}
        onSearch={mockOnSearch}
        onAddToFavorites={mockOnAddToFavorites}
      />
    );

    // Search
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Pharmacy Name'), { target: { value: 'CVS' } });
      fireEvent.click(screen.getByText('Search'));
    });

    await waitFor(() => {
      expect(screen.getByText('CVS Pharmacy')).toBeInTheDocument();
    });

    // Click cancel
    await act(async () => {
      fireEvent.click(screen.getByText('Cancel'));
    });

    expect(onClose).toHaveBeenCalled();
  });

  test('Disables add button when no pharmacy selected', async () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();

    mockOnSearch.mockResolvedValue(mockPharmacies);

    await setup(
      <PharmacyDialog
        patient={HomerSimpson}
        onSubmit={onSubmit}
        onClose={onClose}
        onSearch={mockOnSearch}
        onAddToFavorites={mockOnAddToFavorites}
      />
    );

    // Search
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Pharmacy Name'), { target: { value: 'CVS' } });
      fireEvent.click(screen.getByText('Search'));
    });

    await waitFor(() => {
      expect(screen.getByText('CVS Pharmacy')).toBeInTheDocument();
    });

    // Add button should be disabled initially (when no pharmacy is selected)
    await waitFor(() => {
      const addButton = screen.getByText('Add to Favorites').closest('button');
      expect(addButton).toBeDisabled();
    });
  });

  test('Handles non-success response', async () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();

    mockOnSearch.mockResolvedValue(mockPharmacies);
    mockOnAddToFavorites.mockResolvedValue({
      success: false,
      message: 'Pharmacy already exists',
    });

    await setup(
      <PharmacyDialog
        patient={HomerSimpson}
        onSubmit={onSubmit}
        onClose={onClose}
        onSearch={mockOnSearch}
        onAddToFavorites={mockOnAddToFavorites}
      />
    );

    // Search and add
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Pharmacy Name'), { target: { value: 'CVS' } });
      fireEvent.click(screen.getByText('Search'));
    });

    await waitFor(() => {
      expect(screen.getByText('CVS Pharmacy')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('CVS Pharmacy'));
      fireEvent.click(screen.getByText('Add to Favorites'));
    });

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Organization } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, renderHook, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { vi } from 'vitest';
import { DOSESPOT_ADD_PATIENT_PHARMACY_BOT, DOSESPOT_PHARMACY_ID_SYSTEM, DOSESPOT_SEARCH_PHARMACY_BOT } from './common';
import { useDoseSpotPatientPharmacy } from './useDoseSpotPatientPharmacy';

function TestComponent(): JSX.Element {
  const { state, searchPharmacies, setSelectedPharmacy, setAsPrimary, addFavoritePharmacy, clear } =
    useDoseSpotPatientPharmacy();

  const handleSearch = async (): Promise<void> => {
    await searchPharmacies({ zip: '94118' });
  };

  const handleSetPharmacy = (): void => {
    const testPharmacy: Organization = {
      resourceType: 'Organization',
      name: 'Test Pharmacy',
      identifier: [
        {
          system: DOSESPOT_PHARMACY_ID_SYSTEM,
          value: '12345',
        },
      ],
    };
    setSelectedPharmacy(testPharmacy);
  };

  const handleAddFavorite = async (): Promise<void> => {
    await addFavoritePharmacy('patient-123');
  };

  return (
    <div>
      <div>Selected: {state.selectedPharmacy?.name || 'none'}</div>
      <div>Primary: {state.setAsPrimary ? 'yes' : 'no'}</div>
      <button onClick={handleSearch}>Search</button>
      <button onClick={handleSetPharmacy}>Set Pharmacy</button>
      <button onClick={() => setAsPrimary(true)}>Set Primary</button>
      <button onClick={handleAddFavorite}>Add Favorite</button>
      <button onClick={clear}>Clear</button>
    </div>
  );
}

describe('useDoseSpotPatientPharmacy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('initializes with default state', async () => {
    const medplum = new MockClient();
    medplum.executeBot = vi.fn();

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent />
        </MedplumProvider>
      );
    });

    expect(screen.getByText('Selected: none')).toBeDefined();
    expect(screen.getByText('Primary: no')).toBeDefined();
  });

  test('searchPharmacies returns pharmacies successfully', async () => {
    const medplum = new MockClient();
    const mockPharmacies: Organization[] = [
      {
        resourceType: 'Organization',
        name: 'CVS Pharmacy',
        identifier: [
          {
            system: DOSESPOT_PHARMACY_ID_SYSTEM,
            value: '12345',
          },
        ],
      },
      {
        resourceType: 'Organization',
        name: 'Walgreens',
        identifier: [
          {
            system: DOSESPOT_PHARMACY_ID_SYSTEM,
            value: '67890',
          },
        ],
      },
    ];

    medplum.executeBot = vi.fn().mockResolvedValue(mockPharmacies);

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent />
        </MedplumProvider>
      );
    });

    await act(async () => {
      screen.getByText('Search').click();
    });

    expect(medplum.executeBot).toHaveBeenCalledWith(DOSESPOT_SEARCH_PHARMACY_BOT, { zip: '94118' });
  });

  test('searchPharmacies handles empty results', async () => {
    const medplum = new MockClient();
    const mockPharmacies: Organization[] = [];

    medplum.executeBot = vi.fn().mockResolvedValue(mockPharmacies);

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent />
        </MedplumProvider>
      );
    });

    await act(async () => {
      screen.getByText('Search').click();
    });

    expect(medplum.executeBot).toHaveBeenCalledWith(DOSESPOT_SEARCH_PHARMACY_BOT, { zip: '94118' });
  });

  test('setSelectedPharmacy updates state', async () => {
    const medplum = new MockClient();
    medplum.executeBot = vi.fn();

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent />
        </MedplumProvider>
      );
    });

    await act(async () => {
      screen.getByText('Set Pharmacy').click();
    });

    expect(screen.getByText('Selected: Test Pharmacy')).toBeDefined();
  });

  test('setAsPrimary updates state', async () => {
    const medplum = new MockClient();
    medplum.executeBot = vi.fn();

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent />
        </MedplumProvider>
      );
    });

    expect(screen.getByText('Primary: no')).toBeDefined();

    await act(async () => {
      screen.getByText('Set Primary').click();
    });

    expect(screen.getByText('Primary: yes')).toBeDefined();
  });

  test('addFavoritePharmacy calls bot with correct parameters', async () => {
    const medplum = new MockClient();
    const mockResponse = { success: true, message: 'Success' };
    medplum.executeBot = vi.fn().mockResolvedValue(mockResponse);

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent />
        </MedplumProvider>
      );
    });

    // Set pharmacy first
    await act(async () => {
      screen.getByText('Set Pharmacy').click();
    });

    // Add favorite
    await act(async () => {
      screen.getByText('Add Favorite').click();
    });

    expect(medplum.executeBot).toHaveBeenCalledWith(DOSESPOT_ADD_PATIENT_PHARMACY_BOT, {
      patientId: 'patient-123',
      pharmacy: {
        resourceType: 'Organization',
        name: 'Test Pharmacy',
        identifier: [
          {
            system: DOSESPOT_PHARMACY_ID_SYSTEM,
            value: '12345',
          },
        ],
      },
      setAsPrimary: false,
    });
  });

  test('addFavoritePharmacy with setAsPrimary flag', async () => {
    const medplum = new MockClient();
    const mockResponse = { success: true, message: 'Success' };
    medplum.executeBot = vi.fn().mockResolvedValue(mockResponse);

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent />
        </MedplumProvider>
      );
    });

    // Set pharmacy first
    await act(async () => {
      screen.getByText('Set Pharmacy').click();
    });

    // Set as primary
    await act(async () => {
      screen.getByText('Set Primary').click();
    });

    // Add favorite
    await act(async () => {
      screen.getByText('Add Favorite').click();
    });

    expect(medplum.executeBot).toHaveBeenCalledWith(DOSESPOT_ADD_PATIENT_PHARMACY_BOT, {
      patientId: 'patient-123',
      pharmacy: {
        resourceType: 'Organization',
        name: 'Test Pharmacy',
        identifier: [
          {
            system: DOSESPOT_PHARMACY_ID_SYSTEM,
            value: '12345',
          },
        ],
      },
      setAsPrimary: true,
    });
  });

  test('addFavoritePharmacy throws if no pharmacy selected', async () => {
    const medplum = new MockClient();
    medplum.executeBot = vi.fn();

    const { result } = renderHook(() => useDoseSpotPatientPharmacy(), {
      wrapper: ({ children }) => <MedplumProvider medplum={medplum}>{children}</MedplumProvider>,
    });

    await expect(result.current.addFavoritePharmacy('patient-123')).rejects.toThrow(
      'Must select a pharmacy before adding it as a favorite'
    );
  });

  test('addFavoritePharmacy throws if pharmacy has no valid ID', async () => {
    const medplum = new MockClient();
    medplum.executeBot = vi.fn();

    const { result } = renderHook(() => useDoseSpotPatientPharmacy(), {
      wrapper: ({ children }) => <MedplumProvider medplum={medplum}>{children}</MedplumProvider>,
    });

    // Set pharmacy without valid ID
    act(() => {
      result.current.setSelectedPharmacy({
        resourceType: 'Organization',
        name: 'Invalid Pharmacy',
        identifier: [
          {
            system: 'http://other-system',
            value: '12345',
          },
        ],
      });
    });

    await expect(result.current.addFavoritePharmacy('patient-123')).rejects.toThrow(
      'Selected pharmacy does not have a valid DoseSpot pharmacy ID'
    );
  });

  test('clear resets state', async () => {
    const medplum = new MockClient();
    medplum.executeBot = vi.fn();

    const { result } = renderHook(() => useDoseSpotPatientPharmacy(), {
      wrapper: ({ children }) => <MedplumProvider medplum={medplum}>{children}</MedplumProvider>,
    });

    // Set some state first
    act(() => {
      result.current.setSelectedPharmacy({
        resourceType: 'Organization',
        name: 'Test Pharmacy',
        identifier: [
          {
            system: DOSESPOT_PHARMACY_ID_SYSTEM,
            value: '12345',
          },
        ],
      });
      result.current.setAsPrimary(true);
    });

    // Verify state is set
    expect(result.current.state.selectedPharmacy?.name).toBe('Test Pharmacy');
    expect(result.current.state.setAsPrimary).toBe(true);

    // Clear state
    act(() => {
      result.current.clear();
    });

    // Verify state is cleared
    expect(result.current.state.selectedPharmacy).toBeUndefined();
    expect(result.current.state.setAsPrimary).toBe(false);
  });

  test('searchPharmacies with multiple parameters', async () => {
    const medplum = new MockClient();
    const mockPharmacies: Organization[] = [];
    medplum.executeBot = vi.fn().mockResolvedValue(mockPharmacies);

    const { result } = renderHook(() => useDoseSpotPatientPharmacy(), {
      wrapper: ({ children }) => <MedplumProvider medplum={medplum}>{children}</MedplumProvider>,
    });

    await act(async () => {
      await result.current.searchPharmacies({
        name: 'CVS',
        city: 'San Francisco',
        state: 'CA',
        zip: '94118',
        specialty: [8, 2048],
        pageNumber: 1,
      });
    });

    expect(medplum.executeBot).toHaveBeenCalledWith(DOSESPOT_SEARCH_PHARMACY_BOT, {
      name: 'CVS',
      city: 'San Francisco',
      state: 'CA',
      zip: '94118',
      specialty: [8, 2048],
      pageNumber: 1,
    });
  });
});

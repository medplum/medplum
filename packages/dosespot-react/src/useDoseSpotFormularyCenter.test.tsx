// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Bundle, MedicationKnowledge } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen } from '@testing-library/react';
import { JSX } from 'react';
import { vi } from 'vitest';
import { DOSESPOT_ADD_FAVORITE_MEDICATION_BOT, DOSESPOT_SEARCH_MEDICATIONS_BOT } from './common';
import { useDoseSpotClinicFormulary } from './useDoseSpotFormularyCenter';

function TestComponent(): JSX.Element {
  const {
    state,
    searchMedications,
    addFavoriteMedication,
    setDirections,
    setSelectedMedication,
    getMedicationName,
  } = useDoseSpotClinicFormulary();

  const handleSetMedication = (): void => {
    const testMedication: MedicationKnowledge = {
      resourceType: 'MedicationKnowledge',
      id: 'test',
      code: {
        text: 'Test Medication',
      },
    };
    setSelectedMedication(testMedication);
  };

  return (
    <div>
      <div>Selected: {state.selectedMedication?.code?.text || 'none'}</div>
      <div>Directions: {state.directions || 'none'}</div>
      <button onClick={() => searchMedications('aspirin')}>Search</button>
      <button onClick={() => state.selectedMedication && addFavoriteMedication(state.selectedMedication)}>
        Add Favorite
      </button>
      <button onClick={() => setDirections('Take 1 daily')}>Set Directions</button>
      <button onClick={handleSetMedication}>Set Medication</button>
      <div>Name: {getMedicationName(state.selectedMedication)}</div>
    </div>
  );
}

describe('useDoseSpotClinicFormulary', () => {
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
    expect(screen.getByText('Directions: none')).toBeDefined();
  });

  test('searchMedications returns medications successfully', async () => {
    const medplum = new MockClient();
    const mockBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'MedicationKnowledge',
            id: 'med-1',
            code: {
              text: 'Aspirin 325mg',
            },
            ingredient: [
              {
                strength: {
                  numerator: { value: 325, unit: 'mg' },
                  denominator: { value: 1, unit: 'tablet' },
                },
              },
            ],
          } as MedicationKnowledge,
        },
      ],
    };

    medplum.executeBot = vi.fn().mockResolvedValue(mockBundle);

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

    expect(medplum.executeBot).toHaveBeenCalledWith(DOSESPOT_SEARCH_MEDICATIONS_BOT, { name: 'aspirin' });
  });

  test('searchMedications handles empty results', async () => {
    const medplum = new MockClient();
    const mockBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [],
    };

    medplum.executeBot = vi.fn().mockResolvedValue(mockBundle);

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

    expect(medplum.executeBot).toHaveBeenCalledWith(DOSESPOT_SEARCH_MEDICATIONS_BOT, { name: 'aspirin' });
  });

  test('addFavoriteMedication adds medication with directions', async () => {
    const medplum = new MockClient();

    const expectedMedicationWithDirections = {
      resourceType: 'MedicationKnowledge',
      id: 'test',
      code: {
        text: 'Test Medication',
      },
      administrationGuidelines: [
        {
          dosage: [
            {
              dosage: [
                {
                  patientInstruction: 'Take 1 daily',
                },
              ],
              type: {
                coding: [
                  {
                    system: 'https://dosespot.com/patient-instructions',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    medplum.executeBot = vi.fn().mockResolvedValue(expectedMedicationWithDirections);

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent />
        </MedplumProvider>
      );
    });

    // Set directions first
    await act(async () => {
      screen.getByText('Set Directions').click();
    });

    // Set medication
    await act(async () => {
      screen.getByText('Set Medication').click();
    });

    // Add favorite
    await act(async () => {
      screen.getByText('Add Favorite').click();
    });

    expect(medplum.executeBot).toHaveBeenCalledWith(
      DOSESPOT_ADD_FAVORITE_MEDICATION_BOT,
      expectedMedicationWithDirections
    );
  });

  test('addFavoriteMedication handles empty directions', async () => {
    const medplum = new MockClient();

    const expectedMedicationWithDirections = {
      resourceType: 'MedicationKnowledge',
      id: 'test',
      code: {
        text: 'Test Medication',
      },
      administrationGuidelines: [
        {
          dosage: [
            {
              dosage: [
                {
                  patientInstruction: '',
                },
              ],
              type: {
                coding: [
                  {
                    system: 'https://dosespot.com/patient-instructions',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    medplum.executeBot = vi.fn().mockResolvedValue(expectedMedicationWithDirections);

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent />
        </MedplumProvider>
      );
    });

    // Set medication without directions
    await act(async () => {
      screen.getByText('Set Medication').click();
    });

    // Add favorite
    await act(async () => {
      screen.getByText('Add Favorite').click();
    });

    expect(medplum.executeBot).toHaveBeenCalledWith(
      DOSESPOT_ADD_FAVORITE_MEDICATION_BOT,
      expectedMedicationWithDirections
    );
  });

  test('setDirections updates state', async () => {
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
      screen.getByText('Set Directions').click();
    });

    expect(screen.getByText('Directions: Take 1 daily')).toBeDefined();
  });

  test('setSelectedMedication updates state', async () => {
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
      screen.getByText('Set Medication').click();
    });

    expect(screen.getByText('Selected: Test Medication')).toBeDefined();
  });

  test('getMedicationName returns medication name', async () => {
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
      screen.getByText('Set Medication').click();
    });

    expect(screen.getByText('Name: Test Medication')).toBeDefined();
  });
});

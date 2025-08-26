// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CodeableConcept, Coding } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, renderHook, screen } from '@testing-library/react';
import { JSX } from 'react';
import { vi } from 'vitest';
import { DOSESPOT_ADD_FAVORITE_MEDICATION_BOT, DOSESPOT_SEARCH_MEDICATIONS_BOT } from './common';
import { useDoseSpotClinicFormulary } from './useDoseSpotClinicFormulary';

function TestComponent(): JSX.Element {
  const { state, searchMedications, saveFavoriteMedication, setSelectedMedicationDirections, setSelectedMedication } =
    useDoseSpotClinicFormulary();

  const handleSetMedication = (): void => {
    const testMedication: CodeableConcept = {
      text: 'Test Medication',
      coding: [
        {
          system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
          code: 'test-med',
          display: 'Test Medication',
        },
      ],
    };
    setSelectedMedication(testMedication);
  };

  const handleSetCodingMedication = (): void => {
    const testCoding: Coding = {
      system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
      code: '1191',
      display: 'Aspirin 325 MG Oral Tablet',
    };
    setSelectedMedication(testCoding);
  };

  return (
    <div>
      <div>Selected: {state.selectedMedication?.text || 'none'}</div>
      <div>Directions: {state.directions || 'none'}</div>
      <button onClick={() => searchMedications('aspirin')}>Search</button>
      <button onClick={() => saveFavoriteMedication()}>Add Favorite</button>
      <button onClick={() => setSelectedMedicationDirections('Take 1 daily')}>Set Directions</button>
      <button onClick={handleSetMedication}>Set CodeableConcept Medication</button>
      <button onClick={handleSetCodingMedication}>Set Coding Medication</button>
      <div>Name: {state.selectedMedication?.text || 'none'}</div>
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
    const mockMedications: CodeableConcept[] = [
      {
        text: 'Aspirin 325mg',
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '1191',
            display: 'Aspirin 325 MG Oral Tablet',
          },
        ],
      },
    ];

    medplum.executeBot = vi.fn().mockResolvedValue(mockMedications);

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
    const mockMedications: CodeableConcept[] = [];

    medplum.executeBot = vi.fn().mockResolvedValue(mockMedications);

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

  test('saveFavoriteMedication adds medication with directions', async () => {
    const medplum = new MockClient();

    const expectedMedicationWithDirections = {
      resourceType: 'MedicationKnowledge',
      code: {
        text: 'Test Medication',
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: 'test-med',
            display: 'Test Medication',
          },
        ],
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
      screen.getByText('Set CodeableConcept Medication').click();
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

  test('saveFavoriteMedication handles empty directions', async () => {
    const medplum = new MockClient();

    const expectedMedicationWithDirections = {
      resourceType: 'MedicationKnowledge',
      code: {
        text: 'Test Medication',
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: 'test-med',
            display: 'Test Medication',
          },
        ],
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
      screen.getByText('Set CodeableConcept Medication').click();
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

  test('saveFavoriteMedication with Coding object creates proper structure', async () => {
    const medplum = new MockClient();

    const expectedMedicationWithDirections = {
      resourceType: 'MedicationKnowledge',
      code: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '1191',
            display: 'Aspirin 325 MG Oral Tablet',
          },
        ],
        text: 'Aspirin 325 MG Oral Tablet', // Add this line to match the new behavior
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

    // Set Coding medication
    await act(async () => {
      screen.getByText('Set Coding Medication').click();
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

  test('setSelectedMedicationDirections updates state', async () => {
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

  test('setSelectedMedication with CodeableConcept updates state', async () => {
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
      screen.getByText('Set CodeableConcept Medication').click();
    });

    expect(screen.getByText('Selected: Test Medication')).toBeDefined();
  });

  test('setSelectedMedication with Coding updates state', async () => {
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
      screen.getByText('Set Coding Medication').click();
    });

    expect(screen.getByText('Selected: Aspirin 325 MG Oral Tablet')).toBeDefined();
  });

  test('clear resets state', async () => {
    const medplum = new MockClient();
    medplum.executeBot = vi.fn();

    const { result } = renderHook(() => useDoseSpotClinicFormulary(), {
      wrapper: ({ children }) => <MedplumProvider medplum={medplum}>{children}</MedplumProvider>,
    });

    // Set some state first
    act(() => {
      result.current.setSelectedMedication({ text: 'Test Medication' });
      result.current.setSelectedMedicationDirections('Take 1 daily');
    });

    // Verify state is set
    expect(result.current.state.directions).toBe('Take 1 daily');

    // Clear state
    act(() => {
      result.current.clear();
    });

    // Verify state is cleared
    expect(result.current.state.selectedMedication).toBeUndefined();
    expect(result.current.state.directions).toBeUndefined();
  });
});

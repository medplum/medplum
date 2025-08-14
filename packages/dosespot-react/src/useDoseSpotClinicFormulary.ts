// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CodeableConcept, Coding, MedicationKnowledge } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useState } from 'react';
import { DOSESPOT_ADD_FAVORITE_MEDICATION_BOT, DOSESPOT_SEARCH_MEDICATIONS_BOT } from './common';
import { isCodeableConcept } from '@medplum/core';

export interface DoseSpotClinicFormularyReturn {
  state: DoseSpotClinicFormularyState;
  /**
   * Search for DoseSpot Medications and returns array of temporary MedicationKnowledge objects that are not yet saved to the FHIR server
   */
  readonly searchMedications: (searchTerm: string) => Promise<CodeableConcept[]>;
  /**
   * Set the currently selected medication
   */
  readonly setSelectedMedication: (medication: CodeableConcept | Coding | undefined) => void;
  /**
   * Set the directions for the currently selected medication
   */
  readonly setSelectedMedicationDirections: (directions: string | undefined) => void;
  /**
   * Save a DoseSpot Medication to the Clinic's favorites and returns the MedicationKnowledge object that was saved
   */
  readonly saveFavoriteMedication: () => Promise<MedicationKnowledge>;
  /**
   * Clear the state
   */
  readonly clear: () => void;
}

export interface DoseSpotClinicFormularyState {
  selectedMedication: CodeableConcept | Coding | undefined;
  directions: string | undefined;
}

export function useDoseSpotClinicFormulary(): DoseSpotClinicFormularyReturn {
  const [directions, privateSetDirections] = useState<string | undefined>(undefined);
  const [selectedMedication, privateSetSelectedMedication] = useState<CodeableConcept | Coding | undefined>(undefined);
  const medplum = useMedplum();

  const state: DoseSpotClinicFormularyState = { selectedMedication, directions };

  const saveFavoriteMedication = useCallback(async (): Promise<MedicationKnowledge> => {
    if (!selectedMedication) {
      throw new Error('Must select a medication before adding a favorite medication');
    }

    // Create the code property based on the type of selectedMedication
    let code: CodeableConcept;
    
    if (isCodeableConcept(selectedMedication)) {
      // selectedMedication is already a CodeableConcept
      code = {
        text: selectedMedication.text,
        coding: selectedMedication.coding,
      };
    } else {
      // selectedMedication is a Coding, wrap it in a CodeableConcept
      code = {
        coding: [selectedMedication],
      };
    }

    //Add the directions to the medicationKnowledge object
    const medicationKnowledgeWithDirections = {
      resourceType: 'MedicationKnowledge',
      code,
      administrationGuidelines: [
        {
          dosage: [
            {
              dosage: [
                {
                  patientInstruction: directions || '',
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

    return medplum.executeBot(DOSESPOT_ADD_FAVORITE_MEDICATION_BOT, medicationKnowledgeWithDirections);
  }, [selectedMedication, directions, medplum]);

  const searchMedications = useCallback(
    async (searchTerm: string): Promise<CodeableConcept[]> => {
      return (await medplum.executeBot(DOSESPOT_SEARCH_MEDICATIONS_BOT, { name: searchTerm })) as CodeableConcept[];
    },
    [medplum]
  );

  const setSelectedMedicationDirections = (directions: string | undefined): void => {
    privateSetDirections(directions);
  };

  const setSelectedMedication = (medication: CodeableConcept | Coding | undefined): void => {
    privateSetSelectedMedication(medication);
  };

  const clear = (): void => {
    privateSetSelectedMedication(undefined);
    privateSetDirections(undefined);
  };

  return {
    state,
    searchMedications,
    setSelectedMedication,
    setSelectedMedicationDirections,
    saveFavoriteMedication,
    clear,
  };
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isCodeableConcept, isCoding } from '@medplum/core';
import { CodeableConcept, Coding, MedicationKnowledge } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useState } from 'react';
import { DOSESPOT_ADD_FAVORITE_MEDICATION_BOT, DOSESPOT_SEARCH_MEDICATIONS_BOT } from './common';

export interface DoseSpotClinicFormularyReturn {
  state: DoseSpotClinicFormularyState;
  /**
   * Search for DoseSpot Medications and returns array of temporary MedicationKnowledge objects that are not yet saved to the FHIR server
   */
  readonly searchMedications: (searchTerm: string) => Promise<CodeableConcept[]>;
  /**
   * Set the currently selected medication. Can be set as a CodeableConcept or a Coding, but state is always stored as a CodeableConcept
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
  selectedMedication: CodeableConcept | undefined;
  directions: string | undefined;
}

export function useDoseSpotClinicFormulary(): DoseSpotClinicFormularyReturn {
  const [directions, privateSetDirections] = useState<string | undefined>(undefined);
  const [selectedMedication, privateSetSelectedMedication] = useState<CodeableConcept | undefined>(undefined);
  const medplum = useMedplum();

  const state: DoseSpotClinicFormularyState = { selectedMedication, directions };

  const saveFavoriteMedication = useCallback(async (): Promise<MedicationKnowledge> => {
    if (!selectedMedication) {
      throw new Error('Must select a medication before adding a favorite medication');
    }

    //Add the directions to the medicationKnowledge object
    const medicationKnowledgeWithDirections = {
      resourceType: 'MedicationKnowledge',
      code: { ...selectedMedication },
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
    let medicationToSet: CodeableConcept | undefined;
    if (isCodeableConcept(medication)) {
      medicationToSet = { ...medication };
    } else if (isCoding(medication)) {
      medicationToSet = {
        text: medication.display || '',
        coding: [medication],
      };
    }
    privateSetSelectedMedication(medicationToSet);
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

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedicationKnowledge } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useState } from 'react';
import { DOSESPOT_ADD_FAVORITE_MEDICATION_BOT, DOSESPOT_SEARCH_MEDICATIONS_BOT } from './common';

export interface DoseSpotClinicFormularyReturn {
  state: DoseSpotClinicFormularyState;
  /**
   * Search for DoseSpot Medications and returns array of synthetic MedicationKnowledge objects that are not yet saved to the FHIR server
   */
  readonly searchMedications: (searchTerm: string) => Promise<MedicationKnowledge[]>;
  /**
   * Set the currently selected medication
   */
  readonly setSelectedMedication: (medication: MedicationKnowledge | undefined) => void;
  /**
   * Set the directions for the currently selected medication
   */
  readonly setDirections: (directions: string | undefined) => void;
  /**
   * Add a DoseSpot Medication to the Clinic's favorites and returns the MedicationKnowledge object that was added
   */
  readonly addFavoriteMedication: () => Promise<MedicationKnowledge>;
  /**
   * Helper function to get the name of a medication
   */
  readonly getMedicationName: (medication: MedicationKnowledge | undefined) => string;
}

export interface DoseSpotClinicFormularyState {
  selectedMedication: MedicationKnowledge | undefined;
  directions: string | undefined;
}

export function useDoseSpotClinicFormulary(): DoseSpotClinicFormularyReturn {
  const [directions, privateSetDirections] = useState<string | undefined>(undefined);
  const [selectedMedication, privateSetSelectedMedication] = useState<MedicationKnowledge | undefined>(undefined);
  const medplum = useMedplum();

  const state: DoseSpotClinicFormularyState = { selectedMedication, directions };

  const addFavoriteMedication = useCallback(async (): Promise<MedicationKnowledge> => {
    if (!selectedMedication) {
      throw new Error('Must select a medication before adding a favorite medication');
    }

    //Add the directions to the medicationKnowledge object
    const medicationKnowledgeWithDirections = {
      ...selectedMedication,
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
    async (searchTerm: string): Promise<MedicationKnowledge[]> => {
      return (await medplum.executeBot(DOSESPOT_SEARCH_MEDICATIONS_BOT, { name: searchTerm })) as MedicationKnowledge[];
    },
    [medplum]
  );

  const setDirections = (directions: string | undefined): void => {
    privateSetDirections(directions);
  };

  const setSelectedMedication = (medication: MedicationKnowledge | undefined): void => {
    privateSetSelectedMedication(medication);
  };

  const getMedicationName = (medication: MedicationKnowledge | undefined): string => {
    return medication?.code?.text || '';
  };

  return {
    state,
    searchMedications,
    addFavoriteMedication,
    setDirections,
    setSelectedMedication,
    getMedicationName,
  };
}

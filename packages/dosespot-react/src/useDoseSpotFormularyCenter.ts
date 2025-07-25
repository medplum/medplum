import { Bundle, MedicationKnowledge } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useState } from 'react';
import { DOSESPOT_ADD_FAVORITE_MEDICATION_BOT, DOSESPOT_SEARCH_MEDICATIONS_BOT } from './common';

export interface DoseSpotClinicFormularyReturn {
  readonly searchResults: Bundle<MedicationKnowledge> | undefined;
  readonly searchLoading: boolean;
  readonly searchMedications: (searchTerm: string) => Promise<Bundle<MedicationKnowledge> | undefined>;
  readonly addFavoriteMedication: (medication: MedicationKnowledge) => Promise<MedicationKnowledge>;
  readonly addFavoriteMedicationLoading: boolean;
}

export function useDoseSpotClinicFormulary(): DoseSpotClinicFormularyReturn {
  const medplum = useMedplum();
  const [searchResults, setSearchResults] = useState<Bundle<MedicationKnowledge> | undefined>(undefined);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addFavoriteMedicationLoading, setAddFavoriteMedicationLoading] = useState(false);

  const addFavoriteMedication = useCallback(
    async (medicationKnowledge: MedicationKnowledge) => {
      setAddFavoriteMedicationLoading(true);
      try {
        const response = await medplum.executeBot(DOSESPOT_ADD_FAVORITE_MEDICATION_BOT, medicationKnowledge);
        return response;
      } finally {
        setAddFavoriteMedicationLoading(false);
      }
    },
    [medplum]
  );

  const searchMedications = useCallback(
    async (searchTerm: string): Promise<Bundle<MedicationKnowledge> | undefined> => {
      setSearchLoading(true);
      try {
        const results = await medplum.executeBot(DOSESPOT_SEARCH_MEDICATIONS_BOT, { name: searchTerm });
        setSearchResults(results);
        return results;
      } finally {
        setSearchLoading(false);
      }
    },
    [medplum]
  );

  return {
    //Search
    searchResults,
    searchLoading,
    searchMedications,

    //Add Favorite Medication
    addFavoriteMedication,
    addFavoriteMedicationLoading,
  };
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CodeableConcept } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback } from 'react';
import { DOSESPOT_SEARCH_ALLERGENS_BOT } from './common';

export interface DoseSpotAllergenSearchReturn {
  /**
   * Search for DoseSpot Allergens and returns array of CodeableConcept objects
   */
  readonly searchAllergens: (searchTerm: string) => Promise<CodeableConcept[]>;
}

/**
 * Custom hook for searching DoseSpot allergens.
 * @returns An object containing the searchAllergens function.
 */
export function useDoseSpotAllergenSearch(): DoseSpotAllergenSearchReturn {
  const medplum = useMedplum();

  const searchAllergens = useCallback(
    async (searchTerm: string): Promise<CodeableConcept[]> => {
      return (await medplum.executeBot(DOSESPOT_SEARCH_ALLERGENS_BOT, { name: searchTerm })) as CodeableConcept[];
    },
    [medplum]
  );

  return {
    searchAllergens,
  };
}


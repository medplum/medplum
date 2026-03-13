// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { AddFavoriteParams, AddPharmacyResponse, PharmacySearchParams } from '@medplum/core';
import { isAddPharmacyResponse, isOrganizationArray } from '@medplum/core';
import type { Identifier, Organization } from '@medplum/fhirtypes';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';
import { useCallback } from 'react';

export interface UsePharmacySearchReturn {
  searchPharmacies: (params: PharmacySearchParams) => Promise<Organization[]>;
  addToFavorites: (params: AddFavoriteParams) => Promise<AddPharmacyResponse>;
}

/**
 * Generic React hook that provides pharmacy search and add-to-favorites
 * functionality for any e-prescribing integration.
 *
 * Encapsulates calls to a search-pharmacy bot and an add-patient-pharmacy bot,
 * and can be composed with the generic `PharmacyDialog` component from `@medplum/react`.
 *
 * @param searchBotIdentifier - Bot identifier for the pharmacy search bot.
 * @param addPharmacyBotIdentifier - Bot identifier for the add-patient-pharmacy bot.
 * @returns An object with `searchPharmacies` and `addToFavorites` callbacks.
 */
export function usePharmacySearch(
  searchBotIdentifier: Identifier,
  addPharmacyBotIdentifier: Identifier
): UsePharmacySearchReturn {
  const medplum = useMedplum();

  const searchPharmacies = useCallback(
    async (params: PharmacySearchParams): Promise<Organization[]> => {
      const response = await medplum.executeBot(searchBotIdentifier, params);

      if (!isOrganizationArray(response)) {
        throw new Error('Invalid response from pharmacy search');
      }

      return response;
    },
    [medplum, searchBotIdentifier]
  );

  const addToFavorites = useCallback(
    async (params: AddFavoriteParams): Promise<AddPharmacyResponse> => {
      const response = await medplum.executeBot(addPharmacyBotIdentifier, {
        patientId: params.patientId,
        pharmacy: params.pharmacy,
        setAsPrimary: params.setAsPrimary,
      });

      if (!isAddPharmacyResponse(response)) {
        throw new Error('Invalid response from add pharmacy bot');
      }

      return response;
    },
    [medplum, addPharmacyBotIdentifier]
  );

  return { searchPharmacies, addToFavorites };
}

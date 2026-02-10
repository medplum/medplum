// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { AddFavoriteParams, AddPharmacyResponse, PharmacySearchParams } from '@medplum/core';
import { isAddPharmacyResponse, isOrganizationArray } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback } from 'react';
import { DOSESPOT_ADD_PATIENT_PHARMACY_BOT, DOSESPOT_SEARCH_PHARMACY_BOT } from './common';

export interface UseDoseSpotPharmacySearchReturn {
  searchPharmacies: (params: PharmacySearchParams) => Promise<Organization[]>;
  addToFavorites: (params: AddFavoriteParams) => Promise<AddPharmacyResponse>;
}

/**
 * React hook that provides DoseSpot-specific pharmacy search and add-to-favorites functionality.
 *
 * This hook encapsulates calls to the DoseSpot pharmacy search and add patient pharmacy bots,
 * and can be composed with the generic `PharmacyDialog` component from `@medplum/react`.
 *
 * @returns An object with `searchPharmacies` and `addToFavorites` callbacks.
 */
export function useDoseSpotPharmacySearch(): UseDoseSpotPharmacySearchReturn {
  const medplum = useMedplum();

  const searchPharmacies = useCallback(
    async (params: PharmacySearchParams): Promise<Organization[]> => {
      const response = await medplum.executeBot(DOSESPOT_SEARCH_PHARMACY_BOT, params);

      if (!isOrganizationArray(response)) {
        throw new Error('Invalid response from pharmacy search');
      }

      return response;
    },
    [medplum]
  );

  const addToFavorites = useCallback(
    async (params: AddFavoriteParams): Promise<AddPharmacyResponse> => {
      const response = await medplum.executeBot(DOSESPOT_ADD_PATIENT_PHARMACY_BOT, {
        patientId: params.patientId,
        pharmacy: params.pharmacy,
        setAsPrimary: params.setAsPrimary,
      });

      if (!isAddPharmacyResponse(response)) {
        throw new Error('Invalid response from add pharmacy bot');
      }

      return response;
    },
    [medplum]
  );

  return { searchPharmacies, addToFavorites };
}

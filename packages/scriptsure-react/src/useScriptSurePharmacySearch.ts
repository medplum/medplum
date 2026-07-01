// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { AddFavoriteParams, AddPharmacyResponse } from '@medplum/core';
import { isAddPharmacyResponse, isOrganizationArray } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { useCallback } from 'react';
import { useMedplum } from '@medplum/react-hooks';
import { SCRIPTSURE_ADD_PATIENT_PHARMACY_BOT, SCRIPTSURE_SEARCH_PHARMACY_BOT } from './common';
import type { ScriptSurePharmacySearchParams } from './pharmacy-search';

export interface UseScriptSurePharmacySearchReturn {
  searchPharmacies: (params: ScriptSurePharmacySearchParams) => Promise<Organization[]>;
  addToFavorites: (params: AddFavoriteParams) => Promise<AddPharmacyResponse>;
}

/**
 * React hook that provides ScriptSure-specific pharmacy search and add-to-favorites functionality.
 *
 * Pre-configured with ScriptSure bot identifiers. Search params include ScriptSure-only
 * `specialties` filters for POST /v3/pharmacy/search.
 *
 * @returns An object with `searchPharmacies` and `addToFavorites` callbacks.
 */
export function useScriptSurePharmacySearch(): UseScriptSurePharmacySearchReturn {
  const medplum = useMedplum();

  const searchPharmacies = useCallback(
    async (params: ScriptSurePharmacySearchParams): Promise<Organization[]> => {
      const response = await medplum.executeBot(SCRIPTSURE_SEARCH_PHARMACY_BOT, params);

      if (!isOrganizationArray(response)) {
        throw new Error('Invalid response from pharmacy search');
      }

      return response;
    },
    [medplum]
  );

  const addToFavorites = useCallback(
    async (params: AddFavoriteParams): Promise<AddPharmacyResponse> => {
      const response = await medplum.executeBot(SCRIPTSURE_ADD_PATIENT_PHARMACY_BOT, {
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

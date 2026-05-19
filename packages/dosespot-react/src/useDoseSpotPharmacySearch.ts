// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { UsePharmacySearchReturn } from '@medplum/react-hooks';
import { usePharmacySearch } from '@medplum/react-hooks';
import { DOSESPOT_ADD_PATIENT_PHARMACY_BOT, DOSESPOT_SEARCH_PHARMACY_BOT } from './common';

export type UseDoseSpotPharmacySearchReturn = UsePharmacySearchReturn;

/**
 * React hook that provides DoseSpot-specific pharmacy search and add-to-favorites functionality.
 *
 * Thin wrapper around the generic {@link usePharmacySearch} hook,
 * pre-configured with DoseSpot bot identifiers.
 *
 * @returns An object with `searchPharmacies` and `addToFavorites` callbacks.
 */
export function useDoseSpotPharmacySearch(): UseDoseSpotPharmacySearchReturn {
  return usePharmacySearch(DOSESPOT_SEARCH_PHARMACY_BOT, DOSESPOT_ADD_PATIENT_PHARMACY_BOT);
}

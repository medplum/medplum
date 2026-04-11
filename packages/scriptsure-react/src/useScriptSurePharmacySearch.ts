// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { UsePharmacySearchReturn } from '@medplum/react-hooks';
import { usePharmacySearch } from '@medplum/react-hooks';
import { SCRIPTSURE_ADD_PATIENT_PHARMACY_BOT, SCRIPTSURE_SEARCH_PHARMACY_BOT } from './common';

export type UseScriptSurePharmacySearchReturn = UsePharmacySearchReturn;

/**
 * React hook that provides ScriptSure-specific pharmacy search and add-to-favorites functionality.
 *
 * Thin wrapper around the generic {@link usePharmacySearch} hook,
 * pre-configured with ScriptSure bot identifiers.
 *
 * @returns An object with `searchPharmacies` and `addToFavorites` callbacks.
 */
export function useScriptSurePharmacySearch(): UseScriptSurePharmacySearchReturn {
  return usePharmacySearch(SCRIPTSURE_SEARCH_PHARMACY_BOT, SCRIPTSURE_ADD_PATIENT_PHARMACY_BOT);
}

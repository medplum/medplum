// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { UsePharmacySearchReturn } from '@medplum/react-hooks';
import { usePharmacySearch } from '@medplum/react-hooks';
import { SCRIPTSURE_ADD_PATIENT_PHARMACY_BOT, SCRIPTSURE_SEARCH_PHARMACY_BOT } from './common';
import type { ScriptSurePharmacySearchParams } from './pharmacy-search';

export type UseScriptSurePharmacySearchReturn = UsePharmacySearchReturn<ScriptSurePharmacySearchParams>;

/* eslint-disable jsdoc/escape-inline-tags -- TSDoc cross-package {@link @package#symbol} references */
/**
 * React hook that provides ScriptSure-specific pharmacy search and add-to-favorites functionality.
 *
 * Thin wrapper around the generic {@link @medplum/react-hooks#usePharmacySearch} hook, pre-configured with
 * ScriptSure bot identifiers and widened so search params carry ScriptSure-only
 * `specialties` filters for POST /v3/pharmacy/search.
 *
 * @returns An object with `searchPharmacies` and `addToFavorites` callbacks.
 */
export function useScriptSurePharmacySearch(): UseScriptSurePharmacySearchReturn {
  return usePharmacySearch<ScriptSurePharmacySearchParams>(
    SCRIPTSURE_SEARCH_PHARMACY_BOT,
    SCRIPTSURE_ADD_PATIENT_PHARMACY_BOT
  );
}

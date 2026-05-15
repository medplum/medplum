// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { UseMedicationOrderReturn } from '@medplum/react-hooks';
import { useMedicationOrder } from '@medplum/react-hooks';
import { SCRIPTSURE_DRUG_SEARCH_BOT, SCRIPTSURE_ORDER_MEDICATION_BOT } from './common';

export type UseScriptSureOrderMedicationReturn = UseMedicationOrderReturn;

/**
 * React hook for ScriptSure drug search and pending order creation (iframe launch URL).
 *
 * Thin wrapper around `useMedicationOrder` from `@medplum/react-hooks` with ScriptSure bot identifiers.
 *
 * @returns The same API as `useMedicationOrder` (search + order callbacks).
 */
export function useScriptSureOrderMedication(): UseScriptSureOrderMedicationReturn {
  return useMedicationOrder(SCRIPTSURE_DRUG_SEARCH_BOT, SCRIPTSURE_ORDER_MEDICATION_BOT);
}

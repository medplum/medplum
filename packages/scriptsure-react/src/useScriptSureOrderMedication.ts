// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { UseEPrescribingOrderReturn } from '@medplum/react-hooks';
import { useEPrescribingOrder } from '@medplum/react-hooks';
import { SCRIPTSURE_DRUG_SEARCH_BOT, SCRIPTSURE_ORDER_MEDICATION_BOT } from './common';

export type UseScriptSureOrderMedicationReturn = UseEPrescribingOrderReturn;

/**
 * React hook for ScriptSure drug search and pending order creation (iframe launch URL).
 *
 * Thin wrapper around `useEPrescribingOrder` from `@medplum/react-hooks` with ScriptSure bot identifiers.
 *
 * @returns The same API as `useEPrescribingOrder` (search + order callbacks).
 */
export function useScriptSureOrderMedication(): UseScriptSureOrderMedicationReturn {
  return useEPrescribingOrder(SCRIPTSURE_DRUG_SEARCH_BOT, SCRIPTSURE_ORDER_MEDICATION_BOT);
}

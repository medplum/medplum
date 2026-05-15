// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedicationOrderRequest, MedicationOrderResponse, MedicationSearchParams } from '@medplum/core';
import {
  INVALID_MEDICATION_ORDER_RESPONSE,
  INVALID_MEDICATION_SEARCH_RESPONSE,
  isMedicationArray,
  isMedicationOrderResponse,
} from '@medplum/core';
import type { Identifier, Medication } from '@medplum/fhirtypes';
import { useCallback } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

export interface UseMedicationOrderReturn {
  searchMedications: (params: MedicationSearchParams) => Promise<Medication[]>;
  orderMedication: (input: MedicationOrderRequest) => Promise<MedicationOrderResponse>;
}

/**
 * Generic hook for e-prescribing drug search and order-medication bots.
 *
 * **Identifier stability matters.** The two `Identifier` arguments are tracked
 * by reference in the internal `useCallback` dependency arrays — passing fresh
 * object literals on every render (inline `{ system, value }` literals in JSX,
 * for example) re-creates `searchMedications` and `orderMedication` on every
 * render, which in turn invalidates any consumer `useCallback` / `useEffect`
 * that depends on them. To avoid this, declare the bot identifiers as
 * **module-level constants** (preferred) or wrap them in `useMemo`. The
 * vendor-specific wrappers in `@medplum/scriptsure-react` (e.g.
 * `useScriptSureOrderMedication`) are the canonical examples — they import
 * `SCRIPTSURE_DRUG_SEARCH_BOT` and `SCRIPTSURE_ORDER_MEDICATION_BOT` from a
 * sibling module so the references are stable for the whole app lifetime.
 *
 * @param searchBotIdentifier - Bot identifier for drug search (returns Medication[]). Must be reference-stable.
 * @param orderBotIdentifier - Bot identifier for creating a pending order (returns MedicationOrderResponse from medplum-core). Must be reference-stable.
 * @returns Callbacks to search medications and submit an order bot request.
 */
export function useMedicationOrder(
  searchBotIdentifier: Identifier,
  orderBotIdentifier: Identifier
): UseMedicationOrderReturn {
  const medplum = useMedplum();

  const searchMedications = useCallback(
    async (params: MedicationSearchParams): Promise<Medication[]> => {
      const response = await medplum.executeBot(searchBotIdentifier, params);
      if (!isMedicationArray(response)) {
        throw new Error(INVALID_MEDICATION_SEARCH_RESPONSE);
      }
      return response;
    },
    [medplum, searchBotIdentifier]
  );

  const orderMedication = useCallback(
    async (input: MedicationOrderRequest): Promise<MedicationOrderResponse> => {
      const response = await medplum.executeBot(orderBotIdentifier, input);
      if (!isMedicationOrderResponse(response)) {
        throw new Error(INVALID_MEDICATION_ORDER_RESPONSE);
      }
      return response;
    },
    [medplum, orderBotIdentifier]
  );

  return { searchMedications, orderMedication };
}

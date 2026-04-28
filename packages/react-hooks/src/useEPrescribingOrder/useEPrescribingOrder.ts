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

export interface UseEPrescribingOrderReturn {
  searchMedications: (params: MedicationSearchParams) => Promise<Medication[]>;
  orderMedication: (input: MedicationOrderRequest) => Promise<MedicationOrderResponse>;
}

/**
 * Generic hook for e-prescribing drug search and order-medication bots.
 *
 * @param searchBotIdentifier - Bot identifier for drug search (returns Medication[]).
 * @param orderBotIdentifier - Bot identifier for creating a pending order (returns MedicationOrderResponse from medplum-core).
 * @returns Callbacks to search medications and submit an order bot request.
 */
export function useEPrescribingOrder(
  searchBotIdentifier: Identifier,
  orderBotIdentifier: Identifier
): UseEPrescribingOrderReturn {
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

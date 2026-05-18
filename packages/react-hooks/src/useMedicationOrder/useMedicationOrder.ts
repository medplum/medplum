// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedicationOrderRequest, MedicationOrderResponse, MedicationSearchParams } from '@medplum/core';
import {
  INVALID_MEDICATION_ORDER_RESPONSE,
  INVALID_MEDICATION_SEARCH_RESPONSE,
  isResource,
  medicationOrderRequestToParameters,
  medicationSearchParamsToParameters,
  parametersToMedicationOrderResponse,
} from '@medplum/core';
import type { Bundle, Medication, Parameters } from '@medplum/fhirtypes';
import { useCallback } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

export interface UseMedicationOrderReturn {
  searchMedications: (params: MedicationSearchParams) => Promise<Medication[]>;
  orderMedication: (input: MedicationOrderRequest) => Promise<MedicationOrderResponse>;
}

/**
 * Vendor-neutral hook for e-prescribing drug search and order-medication via
 * **FHIR custom operations** (no Bot identifiers required).
 *
 * Hits two project-scoped operations whose backing Bot is chosen at deploy time
 * via an `OperationDefinition` resource carrying the
 * `operationDefinition-implementation` extension — see
 * [bot operations docs](https://www.medplum.com/docs/bots/custom-fhir-operations).
 * The server's `tryCustomOperation` dispatch handles the OD → Bot lookup, so
 * projects can swap vendors (ScriptSure today, DoseSpot tomorrow) by deploying
 * a different bot under the same operation code.
 *
 * - `searchMedications`: `POST /fhir/R4/Medication/$drug-search` — expects the
 *   bot to return a `Bundle<Medication>` (single-Resource `return` shortcut on
 *   the OperationDefinition).
 * - `orderMedication`: `POST /fhir/R4/MedicationRequest/$order-medication` —
 *   expects the bot to return a `Parameters` envelope with named primitives;
 *   `parametersToMedicationOrderResponse` decodes it.
 *
 * @returns Callbacks to search medications and submit an order request.
 */
export function useMedicationOrder(): UseMedicationOrderReturn {
  const medplum = useMedplum();

  const searchMedications = useCallback(
    async (params: MedicationSearchParams): Promise<Medication[]> => {
      const url = medplum.fhirUrl('Medication', '$drug-search');
      const body = medicationSearchParamsToParameters(params);
      const response = await medplum.post(url, body);
      if (!isResource<Bundle<Medication>>(response, 'Bundle')) {
        throw new Error(INVALID_MEDICATION_SEARCH_RESPONSE);
      }
      return (response.entry ?? []).map((e) => e.resource).filter((r): r is Medication => Boolean(r));
    },
    [medplum]
  );

  const orderMedication = useCallback(
    async (input: MedicationOrderRequest): Promise<MedicationOrderResponse> => {
      const url = medplum.fhirUrl('MedicationRequest', '$order-medication');
      const body = medicationOrderRequestToParameters(input);
      const response = await medplum.post(url, body);
      if (!isResource<Parameters>(response, 'Parameters')) {
        // Server returned something other than a Parameters envelope. Surface the
        // existing INVALID_MEDICATION_ORDER_RESPONSE so callers (e.g. the Provider
        // App's draft-MR cleanup branch) keep their single error-handling path.
        throw new Error(INVALID_MEDICATION_ORDER_RESPONSE);
      }
      return parametersToMedicationOrderResponse(response);
    },
    [medplum]
  );

  return { searchMedications, orderMedication };
}

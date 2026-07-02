// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  MedicationCartClearRequest,
  MedicationCartManageResponse,
  MedicationCartRemoveRequest,
} from '@medplum/core';
import {
  INVALID_MEDICATION_CART_RESPONSE,
  isResource,
  medicationCartClearRequestToParameters,
  medicationCartRemoveRequestToParameters,
  parametersToMedicationCartManageResponse,
} from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { useCallback } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

export interface UseMedicationCartReturn {
  /** Remove a single draft `MedicationRequest` from the patient's vendor cart. */
  removeFromCart: (input: MedicationCartRemoveRequest) => Promise<MedicationCartManageResponse>;
  /** Remove every item from the patient's vendor cart. */
  clearCart: (input: MedicationCartClearRequest) => Promise<MedicationCartManageResponse>;
}

/**
 * Vendor-neutral hook for **cart management**: remove one medication from, or
 * clear, the patient's e-prescribing vendor cart (and revert the affected draft
 * `MedicationRequest`s to plain drafts server-side).
 *
 * Hits the project-scoped **FHIR custom operations**
 * `POST /fhir/R4/MedicationRequest/$remove-cart-medication` and
 * `POST /fhir/R4/MedicationRequest/$clear-cart`, whose backing Bot is chosen at
 * deploy time via an `OperationDefinition` carrying the
 * `operationDefinition-implementation` extension — see
 * [bot operations docs](https://www.medplum.com/docs/bots/custom-fhir-operations).
 * The server's `tryCustomOperation` dispatch handles the OD → Bot lookup, so
 * projects swap vendors by deploying a different bot under the same code.
 *
 * Mirrors `useMedicationCheckout`: requests are encoded as `Parameters` bodies
 * and the `Parameters` responses are decoded by
 * `parametersToMedicationCartManageResponse`. Per-line outcomes arrive in
 * `response.items`.
 *
 * @returns Callbacks to remove one item or clear the whole cart.
 */
export function useMedicationCart(): UseMedicationCartReturn {
  const medplum = useMedplum();

  const removeFromCart = useCallback(
    async (input: MedicationCartRemoveRequest): Promise<MedicationCartManageResponse> => {
      const url = medplum.fhirUrl('MedicationRequest', '$remove-cart-medication');
      const response = await medplum.post(url, medicationCartRemoveRequestToParameters(input));
      if (!isResource<Parameters>(response, 'Parameters')) {
        throw new Error(INVALID_MEDICATION_CART_RESPONSE);
      }
      return parametersToMedicationCartManageResponse(response);
    },
    [medplum]
  );

  const clearCart = useCallback(
    async (input: MedicationCartClearRequest): Promise<MedicationCartManageResponse> => {
      const url = medplum.fhirUrl('MedicationRequest', '$clear-cart');
      const response = await medplum.post(url, medicationCartClearRequestToParameters(input));
      if (!isResource<Parameters>(response, 'Parameters')) {
        throw new Error(INVALID_MEDICATION_CART_RESPONSE);
      }
      return parametersToMedicationCartManageResponse(response);
    },
    [medplum]
  );

  return { removeFromCart, clearCart };
}

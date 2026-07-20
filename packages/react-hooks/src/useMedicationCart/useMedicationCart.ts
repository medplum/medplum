// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  MedicationCartClearRequest,
  MedicationCartManageResponse,
  MedicationCartRemoveRequest,
  MedicationCheckoutRequest,
  MedicationCheckoutResponse,
} from '@medplum/core';
import {
  INVALID_MEDICATION_CART_RESPONSE,
  INVALID_MEDICATION_CHECKOUT_RESPONSE,
  isResource,
  medicationCartClearRequestToParameters,
  medicationCartRemoveRequestToParameters,
  medicationCheckoutRequestToParameters,
  parametersToMedicationCartManageResponse,
  parametersToMedicationCheckoutResponse,
} from '@medplum/core';
import type { MedicationRequest, Parameters } from '@medplum/fhirtypes';
import { useCallback, useRef, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

/** Thrown by {@link UseMedicationCartReturn.checkout} when an {@link UseMedicationCartReturn.addToCart} call is still in flight. */
export const MEDICATION_CART_ADD_IN_PROGRESS = 'Cannot checkout while a medication is still being added to the cart';

export interface UseMedicationCartReturn {
  /**
   * Persist a draft `MedicationRequest` as a cart line via plain FHIR
   * `createResource` (no custom operation). Vendor staging happens later at
   * {@link UseMedicationCartReturn.checkout}.
   */
  addToCart: (medicationRequest: MedicationRequest) => Promise<MedicationRequest>;
  /** True while one or more {@link UseMedicationCartReturn.addToCart} calls are in flight. */
  adding: boolean;
  /**
   * Submit draft cart lines to the vendor's batch approval queue and return an
   * embeddable approval-widget URL. Refuses while {@link UseMedicationCartReturn.adding} is true.
   */
  checkout: (input: MedicationCheckoutRequest) => Promise<MedicationCheckoutResponse>;
  /** Remove a single draft `MedicationRequest` from the patient's vendor cart. */
  removeFromCart: (input: MedicationCartRemoveRequest) => Promise<MedicationCartManageResponse>;
  /** Remove every item from the patient's vendor cart. */
  clearCart: (input: MedicationCartClearRequest) => Promise<MedicationCartManageResponse>;
}

/**
 * Vendor-neutral hook for the full **medication cart** lifecycle: add a draft
 * line (`createResource`), check out a set of drafts into the vendor's batch
 * approval queue (`$checkout-medications`), and remove/clear cart lines
 * (`$remove-cart-medication` / `$clear-cart`).
 *
 * Cart checkout / remove / clear hit project-scoped **FHIR custom operations**
 * whose backing Bot is chosen at deploy time via an `OperationDefinition`
 * carrying the `operationDefinition-implementation` extension — see
 * [bot operations docs](https://www.medplum.com/docs/bots/custom-fhir-operations).
 * The server's `tryCustomOperation` dispatch handles the OD → Bot lookup, so
 * projects swap vendors by deploying a different bot under the same code.
 *
 * `addToCart` is plain FHIR `createResource` (no `$add-cart` operation): the
 * Medplum-side cart is the set of draft `MedicationRequest`s. Vendor staging
 * (e.g. ScriptSure MedCart) happens at checkout. Vendors without a batch
 * approval queue (e.g. DoseSpot iframe-first) simply never call `checkout` /
 * `removeFromCart` / `clearCart`.
 *
 * Requests for the custom operations are encoded as `Parameters` bodies and
 * decoded by the matching `@medplum/core` helpers. Per-line outcomes arrive in
 * `response.items`.
 *
 * @returns Cart add / checkout / remove / clear callbacks plus `adding` state.
 */
export function useMedicationCart(): UseMedicationCartReturn {
  const medplum = useMedplum();
  const [adding, setAdding] = useState(false);
  const pendingAddsRef = useRef(0);

  const addToCart = useCallback(
    async (medicationRequest: MedicationRequest): Promise<MedicationRequest> => {
      pendingAddsRef.current += 1;
      setAdding(true);
      try {
        return await medplum.createResource<MedicationRequest>(medicationRequest);
      } finally {
        pendingAddsRef.current -= 1;
        if (pendingAddsRef.current <= 0) {
          pendingAddsRef.current = 0;
          setAdding(false);
        }
      }
    },
    [medplum]
  );

  const checkout = useCallback(
    async (input: MedicationCheckoutRequest): Promise<MedicationCheckoutResponse> => {
      if (pendingAddsRef.current > 0) {
        throw new Error(MEDICATION_CART_ADD_IN_PROGRESS);
      }
      const url = medplum.fhirUrl('MedicationRequest', '$checkout-medications');
      const body = medicationCheckoutRequestToParameters(input);
      const response = await medplum.post(url, body);
      if (!isResource<Parameters>(response, 'Parameters')) {
        throw new Error(INVALID_MEDICATION_CHECKOUT_RESPONSE);
      }
      return parametersToMedicationCheckoutResponse(response);
    },
    [medplum]
  );

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

  return { addToCart, adding, checkout, removeFromCart, clearCart };
}

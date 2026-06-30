// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedicationCheckoutRequest, MedicationCheckoutResponse } from '@medplum/core';
import {
  INVALID_MEDICATION_CHECKOUT_RESPONSE,
  isResource,
  medicationCheckoutRequestToParameters,
  parametersToMedicationCheckoutResponse,
} from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { useCallback } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

export interface UseMedicationCheckoutReturn {
  checkout: (input: MedicationCheckoutRequest) => Promise<MedicationCheckoutResponse>;
}

/**
 * Vendor-neutral hook for **cart checkout**: submit a set of draft
 * `MedicationRequest`s (the cart) to the e-prescribing vendor's electronic
 * approval queue and get back a single embeddable approval-widget URL where the
 * prescriber batch-signs every queued med in one pass.
 *
 * Hits `POST /fhir/R4/MedicationRequest/$checkout-medications`, a project-scoped
 * **FHIR custom operation** whose backing Bot is chosen at deploy time via an
 * `OperationDefinition` carrying the `operationDefinition-implementation`
 * extension — see [bot operations docs](https://www.medplum.com/docs/bots/custom-fhir-operations).
 * The server's `tryCustomOperation` dispatch handles the OD → Bot lookup, so
 * projects swap vendors by deploying a different bot under the same code.
 *
 * Mirrors `useMedicationOrder`: the request is encoded as a `Parameters` body and
 * the `Parameters` response is decoded by `parametersToMedicationCheckoutResponse`.
 * Per-line failures arrive in `response.items` (status `failed`) rather than as a
 * thrown error, so a single bad line never fails the whole checkout.
 *
 * @returns A callback that submits a cart checkout request.
 */
export function useMedicationCheckout(): UseMedicationCheckoutReturn {
  const medplum = useMedplum();

  const checkout = useCallback(
    async (input: MedicationCheckoutRequest): Promise<MedicationCheckoutResponse> => {
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

  return { checkout };
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { UseMedicationCheckoutReturn } from '@medplum/react-hooks';
import { useMedicationCheckout } from '@medplum/react-hooks';

export type UseScriptSureCheckoutReturn = UseMedicationCheckoutReturn;

/**
 * React hook for ScriptSure **cart checkout**: add a cart of draft
 * `MedicationRequest`s to the patient's ScriptSure MedCart and return a single
 * MedCart widget URL (`/widgets/medcart/{patientId}`) for batch review +
 * send/sign.
 *
 * A near-empty re-export of `useMedicationCheckout` from `@medplum/react-hooks`:
 * the vendor binding lives entirely on the server, where each Medplum project's
 * `OperationDefinition` for `$checkout-medications` points at the ScriptSure
 * cart-checkout bot via the `operationDefinition-implementation` extension. See
 * the deploy script in `medplum-ee/packages/scriptsure/src/scripts/deploy.ts`
 * for how that resource is upserted.
 *
 * Kept as a typed alias for source-compatibility with apps importing
 * `useScriptSureCheckout` and as a documentation anchor for the
 * ScriptSure-specific behavior (patient-must-be-synced precondition; cart items
 * await sign-off in the MedCart widget).
 *
 * @returns The same API as `useMedicationCheckout` (the `checkout` callback).
 */
export function useScriptSureCheckout(): UseScriptSureCheckoutReturn {
  return useMedicationCheckout();
}

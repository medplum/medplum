// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { UseMedicationCartReturn } from '@medplum/react-hooks';
import { useMedicationCart } from '@medplum/react-hooks';

export type UseScriptSureCartReturn = UseMedicationCartReturn;

/**
 * React hook for the ScriptSure **medication cart** lifecycle: add a draft
 * `MedicationRequest` line (`createResource`), check out drafts into the
 * patient's ScriptSure MedCart (`$checkout-medications` →
 * `/widgets/medcart/{patientId}`), and remove/clear cart lines
 * (`$remove-cart-medication` / `$clear-cart`).
 *
 * A near-empty re-export of `useMedicationCart` from `@medplum/react-hooks`: the
 * vendor binding for the custom operations lives entirely on the server, where
 * each Medplum project's `OperationDefinition`s point at the ScriptSure bots via
 * the `operationDefinition-implementation` extension — see
 * [Custom FHIR Operations](https://www.medplum.com/docs/bots/custom-fhir-operations).
 * (Internal deploy: `medplum-ee/packages/scriptsure/src/scripts/deploy.ts`.)
 *
 * `addToCart` is plain FHIR create (no vendor call); MedCart staging happens at
 * `checkout`. DoseSpot and other iframe-first vendors do not use this surface.
 *
 * Kept as a typed alias for source-compatibility with apps importing
 * `useScriptSureCart` and as a documentation anchor for ScriptSure-specific
 * behavior (patient-must-be-synced precondition; cart items await sign-off in
 * the MedCart widget).
 *
 * @returns The same API as `useMedicationCart` (`addToCart`, `adding`,
 * `checkout`, `removeFromCart`, `clearCart`).
 */
export function useScriptSureCart(): UseScriptSureCartReturn {
  return useMedicationCart();
}

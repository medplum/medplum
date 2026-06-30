// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { UseMedicationCartReturn } from '@medplum/react-hooks';
import { useMedicationCart } from '@medplum/react-hooks';

export type UseScriptSureCartReturn = UseMedicationCartReturn;

/**
 * React hook for ScriptSure **cart management**: remove one medication from, or
 * clear, the patient's ScriptSure MedCart (`DELETE /v3/medcart/{patientId}/{rxId}`
 * / per-item clear). Reverts the affected draft `MedicationRequest`s to plain
 * (non-in-cart) drafts server-side.
 *
 * A near-empty re-export of `useMedicationCart` from `@medplum/react-hooks`: the
 * vendor binding lives entirely on the server, where each Medplum project's
 * `OperationDefinition`s for `$remove-cart-medication` / `$clear-cart` point at
 * the ScriptSure cart-manage bot via the `operationDefinition-implementation`
 * extension. See the deploy script in
 * `medplum-ee/packages/scriptsure/src/scripts/deploy.ts`.
 *
 * Kept as a typed alias for source-compatibility with apps importing
 * `useScriptSureCart` and as a documentation anchor for the ScriptSure-specific
 * behavior.
 *
 * @returns The same API as `useMedicationCart` (`removeFromCart`, `clearCart`).
 */
export function useScriptSureCart(): UseScriptSureCartReturn {
  return useMedicationCart();
}

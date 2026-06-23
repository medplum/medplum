// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { UseMedicationOrderReturn } from '@medplum/react-hooks';
import { useMedicationOrder } from '@medplum/react-hooks';

export type UseScriptSureOrderMedicationReturn = UseMedicationOrderReturn;

/**
 * React hook for ScriptSure drug search and pending order creation (iframe launch URL).
 *
 * Now a near-empty re-export of `useMedicationOrder` from `@medplum/react-hooks`: the
 * vendor binding lives entirely on the server, where each Medplum project's
 * `OperationDefinition` resources for `$drug-search` and `$order-medication`
 * point at the ScriptSure bots via the
 * `operationDefinition-implementation` extension. See the deploy script in
 * `medplum-ee/packages/scriptsure/src/scripts/deploy.ts` for how those
 * resources are upserted.
 *
 * Kept as a typed alias for backwards source-compatibility with apps importing
 * `useScriptSureOrderMedication` and as a documentation anchor for the
 * ScriptSure-specific behavior (e.g. patient-must-be-synced precondition).
 *
 * @returns The same API as `useMedicationOrder` (search + order callbacks).
 */
export function useScriptSureOrderMedication(): UseScriptSureOrderMedicationReturn {
  return useMedicationOrder();
}

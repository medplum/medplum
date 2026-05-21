// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { UseMedicationOrderSetReturn } from '@medplum/react-hooks';
import { useMedicationOrderSet } from '@medplum/react-hooks';

export interface UseScriptSureOrderSetOptions {
  /** Patient to prescribe against. Hook stays idle (no operation call) until set. */
  readonly patientId: string | undefined;
  /** Medplum PlanDefinition id; bot reverse-looks up the ScriptSure orderset id. */
  readonly planDefinitionId?: string;
  /** ScriptSure orderset id (escape hatch when no synced PD exists yet). */
  readonly scriptSureOrdersetId?: number;
  readonly appId?: string;
}

export type UseScriptSureOrderSetReturn = UseMedicationOrderSetReturn;

/**
 * React hook that returns the ScriptSure order-set prescribing widget URL via
 * the vendor-neutral `$order-set-url` FHIR custom operation
 * (`POST /fhir/R4/PlanDefinition/$order-set-url`).
 *
 * Thin wrapper around {@link useMedicationOrderSet}: forwards
 * `scriptSureOrdersetId` as the operation's `vendorOrderSetId` parameter,
 * leaves vendor binding to the deployed `OperationDefinition` →
 * `Bot/scriptsure-order-set-bot` link.
 *
 * The operation is naturally idempotent — re-calls only refresh the session
 * token in the returned URL — so callers can safely wire `refresh` into
 * `PrescriptionIFrameModal.onRefreshLaunchUrl`.
 *
 * @param options - Patient + order-set picker (PD or ScriptSure id).
 * @returns `{ url, loading, error, refresh }`.
 */
export function useScriptSureOrderSet(options: UseScriptSureOrderSetOptions): UseScriptSureOrderSetReturn {
  return useMedicationOrderSet({
    patientId: options.patientId,
    planDefinitionId: options.planDefinitionId,
    vendorOrderSetId: options.scriptSureOrdersetId,
    appId: options.appId,
  });
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { UseMedicationOrderSetReturn } from '@medplum/react-hooks';
import { useMedicationOrderSet } from '@medplum/react-hooks';
import { SCRIPTSURE_ORDER_SET_BOT } from './common';

export interface UseScriptSureOrderSetOptions {
  /** Patient to prescribe against. Hook stays idle (no bot call) until set. */
  readonly patientId: string | undefined;
  /** Medplum PlanDefinition id; bot reverse-looks up the ScriptSure orderset id. */
  readonly planDefinitionId?: string;
  /** ScriptSure orderset id (escape hatch when no synced PD exists yet). */
  readonly scriptSureOrdersetId?: number;
  readonly appId?: string;
}

export type UseScriptSureOrderSetReturn = UseMedicationOrderSetReturn;

/**
 * React hook that returns the ScriptSure order-set prescribing widget URL.
 *
 * Thin wrapper around the generic {@link useMedicationOrderSet} hook,
 * pre-configured with `SCRIPTSURE_ORDER_SET_BOT` and the ScriptSure-specific
 * bot payload field name (`scriptSureOrdersetId`).
 *
 * The bot is naturally idempotent — re-calls only refresh the session token
 * in the returned URL — so callers can safely wire `refresh` into
 * `PrescriptionIFrameModal.onRefreshLaunchUrl`.
 *
 * @param options - Patient + order-set picker (PD or ScriptSure id).
 * @returns `{ url, loading, error, refresh }`.
 */
export function useScriptSureOrderSet(options: UseScriptSureOrderSetOptions): UseScriptSureOrderSetReturn {
  return useMedicationOrderSet(SCRIPTSURE_ORDER_SET_BOT, {
    patientId: options.patientId,
    planDefinitionId: options.planDefinitionId,
    vendorOrderSetId: options.scriptSureOrdersetId,
    vendorOrderSetIdField: 'scriptSureOrdersetId',
    appId: options.appId,
  });
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { OrderSetSyncResponse } from '@medplum/core';
import { OperationOutcomeError, isResource, parametersToOrderSetSyncResponse, resolveId } from '@medplum/core';
import type { Organization, Parameters, Reference } from '@medplum/fhirtypes';
import { useCallback } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

/**
 * Vendor-neutral React hook that syncs a Medplum `PlanDefinition` (type=order-set)
 * to the configured e-prescribing vendor via the `$sync-orderset` custom FHIR operation
 * (`POST /fhir/R4/PlanDefinition/$sync-orderset`).
 *
 * Resolves with the decoded `OrderSetSyncResponse` so callers can surface
 * per-action failures (`results[i].status === 'failed'` / `failedCount > 0`) —
 * without this, an order set that only partially synced would silently apply
 * with fewer meds than the PlanDefinition requested.
 *
 * Resolves with `undefined` when the operation is not deployed (i.e. no
 * e-prescribing vendor is configured for the project), so callers do not need to
 * guard against missing integrations.
 *
 * @returns A stable `syncOrderSet(planDefinitionId, organization?)` callback.
 */
export function useSyncOrderSet(): (
  planDefinitionId: string,
  organization?: Reference<Organization>
) => Promise<OrderSetSyncResponse | undefined> {
  const medplum = useMedplum();

  return useCallback(
    async (
      planDefinitionId: string,
      organization?: Reference<Organization>
    ): Promise<OrderSetSyncResponse | undefined> => {
      try {
        const response = await medplum.post(medplum.fhirUrl('PlanDefinition', '$sync-orderset'), {
          planDefinitionId,
          organizationId: resolveId(organization),
        });
        if (!isResource<Parameters>(response, 'Parameters')) {
          return undefined;
        }
        return parametersToOrderSetSyncResponse(response);
      } catch (err: unknown) {
        // If the operation isn't deployed, silently skip — project has no e-prescribing vendor configured.
        if (err instanceof OperationOutcomeError && err.outcome.issue?.some((i) => i.code === 'not-found')) {
          return undefined;
        }
        throw err;
      }
    },
    [medplum]
  );
}

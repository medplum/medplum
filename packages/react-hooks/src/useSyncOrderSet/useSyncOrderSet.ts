// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isOperationOutcome } from '@medplum/core';
import { useCallback } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

/**
 * Vendor-neutral React hook that syncs a Medplum `PlanDefinition` (type=order-set)
 * to the configured e-prescribing vendor via the `$sync-orderset` custom FHIR operation
 * (`POST /fhir/R4/PlanDefinition/$sync-orderset`).
 *
 * Silently no-ops when the operation is not deployed (i.e. no e-prescribing vendor
 * is configured for the project), so callers do not need to guard against missing
 * integrations.
 *
 * @returns A stable `syncOrderSet(planDefinitionId)` callback.
 */
export function useSyncOrderSet(): (planDefinitionId: string) => Promise<void> {
  const medplum = useMedplum();

  return useCallback(
    async (planDefinitionId: string): Promise<void> => {
      try {
        await medplum.post(medplum.fhirUrl('PlanDefinition', '$sync-orderset'), { planDefinitionId });
      } catch (err: unknown) {
        // If the operation isn't deployed, silently skip — project has no e-prescribing vendor configured.
        if (isOperationOutcome(err) && err.issue?.some((i) => i.code === 'not-found')) {
          return;
        }
        throw err;
      }
    },
    [medplum]
  );
}

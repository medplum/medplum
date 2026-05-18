// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import { isResource, medicationSearchParamsToParameters } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';

/**
 * Reads `{ code, label }` rows from a `Parameters` resource produced by the
 * `$drug-quantity-qualifiers` custom operation. Tolerates either flat parts
 * (`code` + `label` as sibling primitives — current bot output) or grouped
 * `quantityQualifier` part-bearing entries (defensive against a future shape
 * change).
 *
 * @param params - `Parameters` resource returned by the operation.
 * @returns `{ code, label }` rows for UI selects.
 */
function parametersToQuantityQualifiers(params: Parameters): { code: string; label: string }[] {
  const rows: { code: string; label: string }[] = [];
  for (const p of params.parameter ?? []) {
    if (p.name !== 'quantityQualifier' || !p.part) {
      continue;
    }
    const code = p.part.find((part) => part.name === 'code')?.valueString;
    const label = p.part.find((part) => part.name === 'label')?.valueString;
    if (typeof code === 'string' && typeof label === 'string') {
      rows.push({ code, label });
    }
  }
  return rows;
}

/**
 * Fetches NCI potency-unit codes for dispense quantity qualifiers via the
 * vendor-neutral `$drug-quantity-qualifiers` custom FHIR operation. Each
 * Medplum project picks the vendor implementation at deploy time by pointing
 * its `OperationDefinition` at the appropriate Bot (ScriptSure's
 * `scriptsure-drug-search-bot` today; see `deploy.ts`).
 *
 * @param medplum - Medplum client (user session).
 * @returns `{ code, label }` rows for UI selects.
 */
export async function loadScriptSureQuantityQualifiers(
  medplum: MedplumClient
): Promise<{ code: string; label: string }[]> {
  const url = medplum.fhirUrl('Medication', '$drug-quantity-qualifiers');
  const body = medicationSearchParamsToParameters({ quantityQualifiers: true });
  const response = await medplum.post(url, body);
  if (!isResource<Parameters>(response, 'Parameters')) {
    return [];
  }
  return parametersToQuantityQualifiers(response);
}

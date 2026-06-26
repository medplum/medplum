// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import { isResource, medicationSearchParamsToParameters } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';

/**
 * Reads `{ code, label }` rows from a `Parameters` resource produced by the
 * `$drug-quantity-qualifiers` custom operation.
 *
 * The OperationDefinition (see `scriptsure-drug-search-bot` registration in
 * `medplum-ee/packages/scriptsure/src/scripts/deploy.ts`) declares a single
 * repeating output parameter named `quantityQualifier`, each entry bearing
 * `part: [{ name: 'code', valueString }, { name: 'label', valueString }]`.
 * The server's `buildOutputParameters` wraps the bot return value into that
 * shape, so the parser only needs to handle this one canonical layout.
 * Entries missing either inner part are skipped defensively.
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

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import { SCRIPTSURE_DRUG_SEARCH_BOT } from './common';

function isQuantityQualifierResponse(
  value: unknown
): value is { quantityQualifiers: { potencyUnit: string; name: string }[] } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const q = (value as { quantityQualifiers?: unknown }).quantityQualifiers;
  return Array.isArray(q) && (q.length === 0 || typeof (q[0] as { potencyUnit?: string })?.potencyUnit === 'string');
}

/**
 * Fetches NCI potency-unit codes for dispense quantity qualifiers via the
 * `scriptsure-drug-search-bot` with `{ quantityQualifiers: true }`.
 *
 * @param medplum - Medplum client (user session).
 * @returns `{ code, label }` rows for UI selects (maps `potencyUnit` → `code`).
 */
export async function loadScriptSureQuantityQualifiers(
  medplum: MedplumClient
): Promise<{ code: string; label: string }[]> {
  const response = await medplum.executeBot(SCRIPTSURE_DRUG_SEARCH_BOT, { quantityQualifiers: true });
  if (!isQuantityQualifierResponse(response)) {
    return [];
  }
  return response.quantityQualifiers.map((row) => ({
    code: row.potencyUnit,
    label: row.name,
  }));
}

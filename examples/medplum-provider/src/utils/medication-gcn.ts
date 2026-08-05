// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getCodeBySystem, getIdentifier } from '@medplum/core';
import type { Medication } from '@medplum/fhirtypes';
import { SCRIPTSURE_GCN_SEQNO_SYSTEM } from '@medplum/scriptsure-react';

/**
 * Every vendor formulation key (GCN_SEQNO) on a Medication, deduplicated.
 *
 * A name-search hit for a multi-strength product carries one per available
 * strength, on `identifier` or on `code.coding` depending on which lookup
 * produced it. Passing them to the formulation lookup is what lets a prescriber
 * pick a strength for drugs the vendor has no dose-format rows for — each key
 * resolves to a named, dispensable product.
 *
 * Deduplication is on the parsed number, not the raw string, so `"8346"` and
 * `"08346"` cannot present one logical strength as two — which would also make
 * {@link getUnambiguousGcnSeqnoFromMedication} call it ambiguous.
 *
 * @param m - Medication from drug search.
 * @returns Formulation keys as numbers, in the order encountered.
 */
export function getGcnSeqnosFromMedication(m: Medication): number[] {
  const raw: (string | undefined)[] = [
    ...(m.identifier ?? []).filter((id) => id.system === SCRIPTSURE_GCN_SEQNO_SYSTEM).map((id) => id.value),
    ...(m.code?.coding ?? [])
      .filter((coding) => coding.system === SCRIPTSURE_GCN_SEQNO_SYSTEM)
      .map((coding) => coding.code),
  ];

  const seen = new Set<number>();
  for (const value of raw) {
    const parsed = parseVendorKey(value);
    if (parsed !== undefined) {
      seen.add(parsed);
    }
  }
  return [...seen];
}

/**
 * The single formulation key on a Medication, or undefined when it carries none
 * — or **several**.
 *
 * A dose-level formulation has exactly one. A drug-name search hit for a
 * multi-strength product carries one per available strength, and nothing on the
 * resource says which the prescriber meant. Since that key is what the vendor
 * resolves the dose from when there is no NDC, picking the first of several
 * would silently prescribe an arbitrary strength — so an ambiguous Medication
 * yields nothing and the caller falls back to requiring a formulation.
 *
 * @param m - Medication from drug search.
 * @returns The formulation key, or undefined when absent or ambiguous.
 */
export function getUnambiguousGcnSeqnoFromMedication(m: Medication): number | undefined {
  const values = getGcnSeqnosFromMedication(m);
  return values.length === 1 ? values[0] : undefined;
}

/**
 * A human-readable name for a Medication, for the order lines that must carry
 * one explicitly — a formulation-key line has no catalog row to derive it from.
 *
 * Mirrors the fallback chain the MedicationRequest-driven order path uses,
 * because a search hit does not always populate `code.text`; a coding `display`
 * is the next best thing, and either beats sending a line the pharmacy cannot
 * read.
 *
 * @param m - Medication from drug search.
 * @param routedMedIdSystem - Coding system whose `display` to prefer as a fallback.
 * @returns The name, or undefined when the resource carries no usable text.
 */
export function getDisplayNameFromMedication(m: Medication, routedMedIdSystem: string): string | undefined {
  const candidates = [
    m.code?.text,
    m.code?.coding?.find((c) => c.system === routedMedIdSystem)?.display,
    m.code?.coding?.find((c) => c.display)?.display,
  ];
  return candidates.map((c) => c?.trim()).find((c) => Boolean(c));
}

/**
 * Reads a vendor routed medication id off a Medication.
 *
 * @param m - Medication from drug search.
 * @param system - Identifier/coding system carrying the id.
 * @returns The id as a number, or undefined when absent or non-numeric.
 */
export function getVendorKeyFromMedication(m: Medication, system: string): number | undefined {
  return parseVendorKey(getIdentifier(m, system) ?? (m.code && getCodeBySystem(m.code, system)) ?? undefined);
}

/**
 * Parses a vendor key, accepting only digits.
 *
 * `Number.parseInt` alone would take `"12abc"` as `12`; these keys are integer
 * ids, so anything else is bad data and better dropped than half-read.
 *
 * @param value - Raw identifier/coding value.
 * @returns The parsed number, or undefined when absent or not all digits.
 */
function parseVendorKey(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';

/**
 * localStorage key holding the active compartment filter references, as a JSON array of
 * reference strings (e.g. ["Organization/abc", "Patient/123"]). Persisted so the filter
 * survives reloads, mirroring the app's other localStorage-backed preferences.
 */
const STORAGE_KEY = 'compartmentFilter';

/**
 * Returns the active compartment filter references, or an empty array if no filter is set.
 * Tolerates the legacy single-string format that earlier versions stored under the same key.
 * @returns The compartment references (e.g. ["Organization/abc"]).
 */
export function getCompartmentFilters(): string[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((r): r is string => typeof r === 'string' && r.length > 0);
    }
  } catch {
    // Legacy format: a bare reference string rather than a JSON array.
    return [raw];
  }
  return [];
}

/**
 * Builds the default search params for the active compartment filter.
 * Used to seed `MedplumClient.defaultSearchParams` at construction and whenever the filter changes.
 *
 * Multiple compartments are combined with OR semantics via a single comma-separated
 * `_compartment` value (e.g. `_compartment=Organization/abc,Patient/123`), matching a resource
 * that belongs to ANY of the selected compartments.
 * @returns URLSearchParams with `_compartment` set, or undefined if no filter is active.
 */
export function getCompartmentSearchParams(): URLSearchParams | undefined {
  const references = getCompartmentFilters();
  return references.length ? new URLSearchParams({ _compartment: references.join(',') }) : undefined;
}

/**
 * Sets or clears the compartment filter and applies it to the client's default search params.
 *
 * This only narrows queries on the client; the server still enforces the user's access policy,
 * so a user can never see resources they aren't already permitted to read.
 * @param medplum - The Medplum client to apply the filter to.
 * @param references - The compartment references (e.g. ["Organization/abc"]); empty to clear.
 */
export function setCompartmentFilters(medplum: MedplumClient, references: string[]): void {
  if (references.length) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(references));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  medplum.setDefaultSearchParams(getCompartmentSearchParams());
}

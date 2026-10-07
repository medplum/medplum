// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Coding, ValueSet, ValueSetExpansionContains } from '@medplum/fhirtypes';

/**
 * Return complete, unparameterized snapshot entries, including inherited coding identity.
 * Undefined means the caller must use the definition, never treat a partial page as a set.
 * @param valueSet - The stored ValueSet.
 * @returns Flat complete expansion, or undefined when completeness is not established.
 */
export function getValueSetSnapshot(valueSet: ValueSet): ValueSetExpansionContains[] | undefined {
  const expansion = valueSet.expansion;
  if (!expansion || expansion.parameter?.length || (expansion.offset ?? 0) !== 0) {
    return undefined;
  }
  const entries: ValueSetExpansionContains[] = [];
  const visit = (items: ValueSetExpansionContains[], parent?: ValueSetExpansionContains): void => {
    for (const item of items) {
      const { contains, ...rest } = item;
      const system = item.system ?? parent?.system;
      // A child inherits the version only while it remains in its parent's code system.
      const inheritedVersion = !item.system || item.system === parent?.system ? parent?.version : undefined;
      const version = item.version ?? inheritedVersion;
      const coding = { ...rest, system, ...(version ? { version } : {}) };
      if (item.code) {
        entries.push(coding);
      }
      if (contains) {
        visit(contains, coding);
      }
    }
  };
  visit(expansion.contains ?? []);
  if (entries.some((e) => !e.system) || (expansion.total !== undefined && expansion.total !== entries.length)) {
    return undefined;
  }
  // An absent contains array establishes an empty set only with an explicit zero total.
  if (!expansion.contains && expansion.total !== 0) {
    return undefined;
  }
  return entries;
}

/**
 * Check binding membership without imposing display or version constraints on resource writes.
 * @param entries - Complete expanded entries.
 * @param codings - Candidate codings.
 * @returns The matching snapshot entry.
 */
export function findSnapshotCoding(
  entries: ValueSetExpansionContains[],
  codings: Coding[]
): ValueSetExpansionContains | undefined {
  for (const candidate of codings) {
    const match = entries.find((e) => e.system === candidate.system && e.code === candidate.code);
    if (match) {
      return match;
    }
  }
  return undefined;
}

/**
 * Prepare one membership index for all bound values in a resource validation pass.
 * The caller owns its lifetime; mutable ValueSets are never cached across requests.
 * @param valueSet - The stored ValueSet.
 * @returns A membership lookup, or undefined when the definition must be evaluated.
 */
export function createSnapshotMembershipValidator(
  valueSet: ValueSet
): ((codings: Coding[]) => Coding | undefined) | undefined {
  const entries = getValueSetSnapshot(valueSet);
  if (!entries) {
    return undefined;
  }
  const index = new Map<string | undefined, Map<string | undefined, Coding>>();
  for (const entry of entries) {
    let codes = index.get(entry.system);
    if (!codes) {
      codes = new Map();
      index.set(entry.system, codes);
    }
    if (!codes.has(entry.code)) {
      codes.set(entry.code, entry);
    }
  }
  return (codings) => {
    for (const coding of codings) {
      const found = index.get(coding.system)?.get(coding.code);
      if (found) {
        return found;
      }
    }
    return undefined;
  };
}

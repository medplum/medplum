// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Coding, ValueSet, ValueSetComposeInclude } from '@medplum/fhirtypes';
import type { TypedValue } from '../types';
import { isCodeableConcept, isCoding, splitN } from '../utils';

/**
 * In-memory ValueSet registry for synchronous terminology checks used by
 * slicing discriminators (FHIR R4 profiling: value/pattern + required binding).
 *
 * Only extensional membership is supported: explicit `compose.include.concept`
 * lists and/or `expansion.contains`. Includes that reference a full CodeSystem
 * without enumerated concepts cannot be checked here.
 */

interface ValueSetCodeSet {
  /** Keys are `system|code` when system is known, otherwise `|code`. */
  codes: Set<string>;
  /** True when at least one include enumerates concepts or expansion is present. */
  extensional: boolean;
}

const VALUE_SETS: { [url: string]: ValueSetCodeSet } = Object.create(null);

/**
 * Indexes a ValueSet for synchronous membership checks.
 * @param valueSet - The ValueSet resource to index.
 */
export function loadValueSet(valueSet: ValueSet): void {
  if (!valueSet.url) {
    return;
  }
  const codes = new Set<string>();
  let extensional = false;

  for (const include of valueSet.compose?.include ?? []) {
    if (addIncludeConcepts(codes, include)) {
      extensional = true;
    }
  }

  for (const coding of valueSet.expansion?.contains ?? []) {
    if (coding.code) {
      codes.add(codeKey(coding.system, coding.code));
      extensional = true;
    }
  }

  const entry: ValueSetCodeSet = { codes, extensional };
  VALUE_SETS[valueSet.url] = entry;
  // Also index without version suffix for bindings like `...|4.0.1`
  const bare = stripVersion(valueSet.url);
  if (bare !== valueSet.url) {
    VALUE_SETS[bare] = entry;
  }
}

/**
 * Indexes an array of ValueSet resources.
 * @param valueSets - ValueSets to index.
 */
export function indexValueSets(valueSets: ValueSet[]): void {
  for (const vs of valueSets) {
    loadValueSet(vs);
  }
}

/**
 * Returns whether a ValueSet URL has been loaded into the registry.
 * @param url - Canonical ValueSet URL (version suffix optional).
 * @returns True if loaded.
 */
export function isValueSetLoaded(url: string): boolean {
  return !!VALUE_SETS[url] || !!VALUE_SETS[stripVersion(url)];
}

/**
 * Clears the ValueSet registry. Intended for tests.
 */
export function clearValueSets(): void {
  for (const key of Object.keys(VALUE_SETS)) {
    delete VALUE_SETS[key];
  }
}

/**
 * Checks whether a typed FHIR value is in a loaded extensional ValueSet.
 *
 * Per FHIR terminology rules for required bindings:
 * - `code` / `uri` / `string`: the string value must appear in the set
 * - `Coding`: the coding must appear in the set
 * - `CodeableConcept`: at least one coding must appear in the set
 * - `Quantity`: system+code must appear in the set
 *
 * @param typedValue - The instance value being tested.
 * @param valueSetUrl - Canonical ValueSet URL from ElementDefinition.binding.
 * @returns True if membership can be confirmed; false if not a member.
 *   Returns `undefined` when the ValueSet is not loaded or is not extensional
 *   (caller should decide fail-open vs fail-closed).
 */
export function typedValueInValueSet(typedValue: TypedValue, valueSetUrl: string): boolean | undefined {
  const vs = VALUE_SETS[valueSetUrl] ?? VALUE_SETS[stripVersion(valueSetUrl)];
  if (!vs?.extensional) {
    return undefined;
  }

  switch (typedValue.type) {
    case 'code':
    case 'uri':
    case 'string':
    case 'canonical':
      if (typeof typedValue.value !== 'string') {
        return false;
      }
      return vs.codes.has(codeKey(undefined, typedValue.value)) || hasCodeIgnoreSystem(vs, typedValue.value);
    case 'Coding':
      return isCoding(typedValue.value) && codingInValueSet(vs, typedValue.value);
    case 'CodeableConcept': {
      if (!isCodeableConcept(typedValue.value)) {
        return false;
      }
      return typedValue.value.coding.some((c) => codingInValueSet(vs, c));
    }
    case 'Quantity': {
      const q = typedValue.value as { system?: string; code?: string } | undefined;
      if (!q?.code) {
        return false;
      }
      return vs.codes.has(codeKey(q.system, q.code));
    }
    default:
      return false;
  }
}

function addIncludeConcepts(codes: Set<string>, include: ValueSetComposeInclude): boolean {
  if (!include.concept?.length) {
    return false;
  }
  for (const concept of include.concept) {
    if (concept.code) {
      codes.add(codeKey(include.system, concept.code));
    }
  }
  return true;
}

function codingInValueSet(vs: ValueSetCodeSet, coding: Coding): boolean {
  return vs.codes.has(codeKey(coding.system, coding.code));
}

function hasCodeIgnoreSystem(vs: ValueSetCodeSet, code: string): boolean {
  // Mirror FHIR token search "code only" matching (see codingMatchesToken):
  // a bare code matches any system.
  const suffix = '|' + code;
  for (const key of vs.codes) {
    if (key.endsWith(suffix)) {
      return true;
    }
  }
  return false;
}

/** Same `system|code` key shape used elsewhere in core (e.g. stringifyCoding). */
function codeKey(system: string | undefined, code: string): string {
  return `${system ?? ''}|${code}`;
}

function stripVersion(url: string): string {
  return splitN(url, '|', 2)[0];
}

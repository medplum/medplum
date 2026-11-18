// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AccessPolicyInteraction } from '@medplum/core';
import {
  globalSchema,
  matchesSearchRequest,
  parseSearchRequest,
  protectedResourceTypes,
  shallowMatchesResourcePolicy,
} from '@medplum/core';
import type { AccessPolicyResource, Resource, ResourceType } from '@medplum/fhirtypes';
import type { MergedEntry } from './merge';

export const INTERACTIONS: AccessPolicyInteraction[] = [
  'search',
  'read',
  'vread',
  'history',
  'create',
  'update',
  'delete',
];

/** Stand-in resource type for "any type not named explicitly", which only wildcard entries match. */
export const OTHER_TYPE = '(any other type)';

const WRITE_INTERACTIONS: AccessPolicyInteraction[] = ['create', 'update'];

/**
 * Returns the resource types worth showing: every type named in an entry, plus extras, plus the wildcard stand-in.
 * @param entries - The merged entries.
 * @param extraTypes - Additional resource types the user asked about.
 * @returns Sorted resource types, with `OTHER_TYPE` last.
 */
export function listResourceTypes(entries: readonly MergedEntry[], extraTypes: readonly string[] = []): string[] {
  const types = new Set<string>(extraTypes);
  for (const { entry } of entries) {
    if (entry.resourceType !== '*') {
      types.add(entry.resourceType);
    }
  }
  return [...[...types].sort(), OTHER_TYPE];
}

/**
 * Returns true when an entry restricts which resources it applies to.
 * Binary ignores criteria and compartments, so its entries are never conditional.
 * @param entry - The entry.
 * @param resourceType - The resource type being accessed.
 * @returns True if the entry has criteria or a compartment.
 */
export function isConditional(entry: AccessPolicyResource, resourceType: string): boolean {
  if (resourceType === 'Binary') {
    return false;
  }
  return Boolean(entry.criteria || entry.compartment);
}

export function hasFieldRules(entry: AccessPolicyResource): boolean {
  return Boolean(entry.hiddenFields?.length || entry.readonlyFields?.length || entry.writeConstraint?.length);
}

/**
 * Entries that grant an interaction on a resource type, ignoring criteria, in evaluation order.
 * @param entries - The merged entries.
 * @param resourceType - The resource type.
 * @param interaction - The interaction.
 * @returns The candidate entries.
 */
export function candidates(
  entries: readonly MergedEntry[],
  resourceType: string,
  interaction: AccessPolicyInteraction
): MergedEntry[] {
  return entries.filter((e) => shallowMatchesResourcePolicy(e.entry, resourceType as ResourceType, interaction));
}

export type CellStatus = 'denied' | 'all' | 'conditional' | 'protected';

export interface MatrixCell {
  readonly status: CellStatus;
  readonly candidates: MergedEntry[];
  /** True when the matching entries disagree on hidden/readonly fields or write constraints. */
  readonly fieldRulesVary: boolean;
}

export function matrixCell(
  entries: readonly MergedEntry[],
  resourceType: string,
  interaction: AccessPolicyInteraction
): MatrixCell {
  if (protectedResourceTypes.includes(resourceType)) {
    return { status: 'protected', candidates: [], fieldRulesVary: false };
  }
  const matches = candidates(entries, resourceType, interaction);
  if (matches.length === 0) {
    return { status: 'denied', candidates: [], fieldRulesVary: false };
  }
  const status = matches.some((m) => !isConditional(m.entry, resourceType)) ? 'all' : 'conditional';
  const signatures = new Set(matches.map((m) => fieldRuleSignature(m.entry)));
  return { status, candidates: matches, fieldRulesVary: signatures.size > 1 };
}

export type ExplainStatus =
  | 'type-mismatch'
  | 'interaction-mismatch'
  | 'criteria-failed'
  | 'criteria-error'
  | 'winner'
  | 'conditional-winner'
  | 'fallback'
  | 'shadowed';

export interface ExplainRow {
  readonly entry: MergedEntry;
  readonly status: ExplainStatus;
  readonly detail?: string;
}

/**
 * Explains which entry the server would pick for an interaction, and why each other entry was skipped.
 * Without a sample resource, conditional entries are reported as "wins if the resource matches".
 * @param entries - The merged entries.
 * @param resourceType - The resource type.
 * @param interaction - The interaction.
 * @param resource - Optional sample resource to evaluate criteria against.
 * @returns One row per merged entry.
 */
export function explain(
  entries: readonly MergedEntry[],
  resourceType: string,
  interaction: AccessPolicyInteraction,
  resource?: Resource
): ExplainRow[] {
  let decided = false;
  return entries.map((e): ExplainRow => {
    const { entry } = e;
    if (!typeMatches(entry, resourceType)) {
      return { entry: e, status: 'type-mismatch' };
    }
    if (!shallowMatchesResourcePolicy(entry, resourceType as ResourceType, interaction)) {
      return { entry: e, status: 'interaction-mismatch', detail: describeInteractions(entry) };
    }
    if (decided) {
      return { entry: e, status: 'shadowed' };
    }
    if (resource) {
      const result = evaluateFilters(entry, resource);
      if (result === true) {
        decided = true;
        return { entry: e, status: 'winner' };
      }
      return { entry: e, status: result === false ? 'criteria-failed' : 'criteria-error', detail: result || undefined };
    }
    if (isConditional(entry, resourceType)) {
      return { entry: e, status: 'conditional-winner' };
    }
    decided = true;
    const anyConditionalBefore = entries
      .slice(0, e.index)
      .some((p) => shallowMatchesResourcePolicy(p.entry, resourceType as ResourceType, interaction));
    return { entry: e, status: anyConditionalBefore ? 'fallback' : 'winner' };
  });
}

function typeMatches(entry: AccessPolicyResource, resourceType: string): boolean {
  return INTERACTIONS.some((i) => shallowMatchesResourcePolicy(entry, resourceType as ResourceType, i));
}

/**
 * Evaluates an entry's compartment and criteria against a resource, like the server's `matchesResourcePolicyFilters`.
 * @param entry - The entry.
 * @param resource - The resource.
 * @returns True or false, or an error message if the criteria could not be evaluated.
 */
export function evaluateFilters(entry: AccessPolicyResource, resource: Resource): boolean | string {
  if (resource.resourceType === 'Binary') {
    return true;
  }
  if (entry.compartment && !resource.meta?.compartment?.some((c) => c.reference === entry.compartment?.reference)) {
    return false;
  }
  if (entry.criteria) {
    try {
      const searchRequest = parseSearchRequest(normalizeCriteria(entry, resource.resourceType));
      // matchesSearchRequest treats an unknown parameter as "no match", which would look like a real result.
      const searchParams = globalSchema.types[searchRequest.resourceType]?.searchParams;
      const unknown = searchRequest.filters?.find((f) => !searchParams?.[f.code]);
      if (unknown) {
        return `The browser can't evaluate "${unknown.code}" on ${searchRequest.resourceType} (chained, reverse-chained and unknown parameters aren't supported).`;
      }
      return matchesSearchRequest(resource, searchRequest);
    } catch (err) {
      return `Could not evaluate criteria in the browser: ${(err as Error).message}`;
    }
  }
  return true;
}

/**
 * Rewrites wildcard criteria (`*?...`) for a concrete resource type, as the server does.
 * @param entry - The entry.
 * @param resourceType - The concrete resource type.
 * @returns The criteria to evaluate.
 */
export function normalizeCriteria(entry: AccessPolicyResource, resourceType: string): string {
  const criteria = entry.criteria ?? '';
  if (entry.resourceType === '*') {
    const queryIndex = criteria.indexOf('?');
    return resourceType + '?' + criteria.slice(queryIndex + 1);
  }
  return criteria;
}

export interface SearchClause {
  readonly entry: MergedEntry;
  readonly criteria?: string;
  readonly compartment?: string;
}

export interface SearchScope {
  /** No entry allows search on this type: every search returns nothing. */
  readonly denied: boolean;
  /** An entry without criteria makes every resource searchable, regardless of the other clauses. */
  readonly unrestrictedBy?: MergedEntry;
  /** Entries whose criteria do not start with their resource type: the server rejects the whole search with 403. */
  readonly invalid: MergedEntry[];
  /** Clauses OR'd together to form the search filter. */
  readonly clauses: SearchClause[];
}

/**
 * Describes the filter the server adds to searches on a resource type, mirroring `addAccessPolicyFilters`.
 * @param entries - The merged entries.
 * @param resourceType - The resource type being searched.
 * @returns The search scope.
 */
export function searchScope(entries: readonly MergedEntry[], resourceType: string): SearchScope {
  const matches = candidates(entries, resourceType, 'search');
  const invalid: MergedEntry[] = [];
  const clauses: SearchClause[] = [];
  const seen = new Set<string>();
  let unrestrictedBy: MergedEntry | undefined;

  for (const m of matches) {
    const { entry } = m;
    if (resourceType === 'Binary') {
      unrestrictedBy ??= m;
    } else if (entry.compartment?.reference) {
      clauses.push({ entry: m, compartment: entry.compartment.reference });
    } else if (entry.criteria) {
      if (!entry.criteria.startsWith(entry.resourceType + '?')) {
        invalid.push(m);
        continue;
      }
      const criteria = normalizeCriteria(entry, resourceType);
      if (!seen.has(criteria)) {
        seen.add(criteria);
        clauses.push({ entry: m, criteria });
      }
    } else {
      unrestrictedBy ??= m;
    }
  }
  return { denied: matches.length === 0, unrestrictedBy, invalid, clauses };
}

export type FieldIssueSeverity = 'bypassed' | 'maybe-bypassed';

export interface FieldIssue {
  readonly resourceType: string;
  readonly interaction: AccessPolicyInteraction;
  readonly severity: FieldIssueSeverity;
  /** The entry whose field rules are skipped. */
  readonly restricted: MergedEntry;
  /** The earlier entry that wins instead. */
  readonly winner: MergedEntry;
  readonly lostHiddenFields: string[];
  readonly lostReadonlyFields: string[];
  readonly lostWriteConstraints: string[];
}

/**
 * Finds field rules that do not apply because an earlier, less restrictive entry matches first.
 *
 * The server applies `hiddenFields`, `readonlyFields` and `writeConstraint` only from the first entry that matches
 * a resource. A later entry's rules are skipped whenever an earlier entry also matches: always, if the earlier
 * entry has no criteria ("bypassed"); for resources that match its criteria otherwise ("maybe-bypassed").
 * @param entries - The merged entries.
 * @param resourceTypes - The resource types to check.
 * @returns The issues found.
 */
export function findFieldIssues(entries: readonly MergedEntry[], resourceTypes: readonly string[]): FieldIssue[] {
  const issues: FieldIssue[] = [];
  for (const resourceType of resourceTypes) {
    for (const interaction of ['read', ...WRITE_INTERACTIONS] as AccessPolicyInteraction[]) {
      const matches = candidates(entries, resourceType, interaction);
      matches.forEach((restricted, j) => {
        if (!hasFieldRules(restricted.entry)) {
          return;
        }
        for (const winner of matches.slice(0, j)) {
          const lost = lostRules(restricted.entry, winner.entry, interaction);
          if (lost.lostHiddenFields.length || lost.lostReadonlyFields.length || lost.lostWriteConstraints.length) {
            issues.push({
              resourceType,
              interaction,
              severity: isConditional(winner.entry, resourceType) ? 'maybe-bypassed' : 'bypassed',
              restricted,
              winner,
              ...lost,
            });
          }
          if (!isConditional(winner.entry, resourceType)) {
            break;
          }
        }
      });
    }
  }
  return issues;
}

function lostRules(
  restricted: AccessPolicyResource,
  winner: AccessPolicyResource,
  interaction: AccessPolicyInteraction
): Pick<FieldIssue, 'lostHiddenFields' | 'lostReadonlyFields' | 'lostWriteConstraints'> {
  const winnerHidden = new Set(winner.hiddenFields ?? []);
  const winnerProtected = new Set([...(winner.readonlyFields ?? []), ...winnerHidden]);
  const winnerConstraints = new Set((winner.writeConstraint ?? []).map((c) => c.expression));
  const isWrite = WRITE_INTERACTIONS.includes(interaction);
  return {
    // Hidden fields matter on read (removed from output) and on write (preserved from the previous version)
    lostHiddenFields: (restricted.hiddenFields ?? []).filter((f) => !winnerHidden.has(f)),
    lostReadonlyFields: isWrite ? (restricted.readonlyFields ?? []).filter((f) => !winnerProtected.has(f)) : [],
    lostWriteConstraints: isWrite
      ? (restricted.writeConstraint ?? [])
          .map((c) => c.expression ?? '')
          .filter((expression) => !winnerConstraints.has(expression))
      : [],
  };
}

export interface DeadEntry {
  readonly entry: MergedEntry;
  /** For each interaction the entry grants, the earlier unconditional entry that always wins. */
  readonly shadowedBy: Partial<Record<AccessPolicyInteraction, MergedEntry>>;
}

/**
 * Finds entries that can never be selected: for every interaction they grant, an earlier entry without criteria
 * matches the same resource type. Their criteria and field rules have no effect, and in search the earlier
 * entry already lifts the filter.
 * @param entries - The merged entries.
 * @param resourceTypes - Resource types to evaluate wildcard entries against.
 * @returns The dead entries.
 */
export function findDeadEntries(entries: readonly MergedEntry[], resourceTypes: readonly string[]): DeadEntry[] {
  const dead: DeadEntry[] = [];
  for (const e of entries) {
    const types = e.entry.resourceType === '*' ? resourceTypes : [e.entry.resourceType];
    const shadowedBy: Partial<Record<AccessPolicyInteraction, MergedEntry>> = {};
    let alive = false;
    for (const resourceType of types) {
      for (const interaction of INTERACTIONS) {
        if (!shallowMatchesResourcePolicy(e.entry, resourceType as ResourceType, interaction)) {
          continue;
        }
        const blocker = entries
          .slice(0, e.index)
          .find(
            (p) =>
              shallowMatchesResourcePolicy(p.entry, resourceType as ResourceType, interaction) &&
              !isConditional(p.entry, resourceType)
          );
        if (blocker) {
          shadowedBy[interaction] ??= blocker;
        } else {
          alive = true;
        }
      }
    }
    if (!alive && Object.keys(shadowedBy).length > 0) {
      dead.push({ entry: e, shadowedBy });
    }
  }
  return dead;
}

export function describeInteractions(entry: AccessPolicyResource): string {
  if (entry.interaction) {
    return entry.interaction.join(', ');
  }
  return entry.readonly ? 'read-only' : 'all interactions';
}

function fieldRuleSignature(entry: AccessPolicyResource): string {
  return JSON.stringify([
    [...(entry.hiddenFields ?? [])].sort(),
    [...(entry.readonlyFields ?? [])].sort(),
    (entry.writeConstraint ?? []).map((c) => c.expression).sort(),
  ]);
}

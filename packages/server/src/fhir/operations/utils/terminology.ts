// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter, WithId } from '@medplum/core';
import { badRequest, EMPTY, OperationOutcomeError, Operator } from '@medplum/core';
import type {
  CodeSystem,
  CodeSystemProperty,
  ConceptMap,
  ValueSet,
  ValueSetComposeIncludeFilter,
} from '@medplum/fhirtypes';
import { r4ProjectId } from '../../../constants';
import type { Repository } from '../../repo';
import type { PgQueryable } from '../../sql';
import {
  Column,
  Condition,
  Conjunction,
  Constant,
  Disjunction,
  Negation,
  SelectQuery,
  SqlFunction,
  Union,
} from '../../sql';

export const parentProperty = 'http://hl7.org/fhir/concept-properties#parent';
export const childProperty = 'http://hl7.org/fhir/concept-properties#child';
export const abstractProperty = 'http://hl7.org/fhir/concept-properties#notSelectable';

export type TerminologyResource = CodeSystem | ValueSet | ConceptMap;

export async function findTerminologyResource<T extends TerminologyResource>(
  repo: Repository,
  resourceType: T['resourceType'],
  url: string,
  options?: {
    version?: string;
    ownProjectOnly?: boolean;
  }
): Promise<WithId<T>> {
  if (!url) {
    throw new OperationOutcomeError(badRequest(`${resourceType} not specified`));
  }

  const versionDelim = url.lastIndexOf('|');
  if (versionDelim > 0) {
    url = url.slice(0, versionDelim);
    options = { ...options, version: options?.version ?? url.slice(versionDelim + 1) };
  }

  const filters: Filter[] = [
    { code: 'url', operator: Operator.EQUALS, value: url },
    { code: 'status', operator: Operator.NOT_EQUALS, value: 'retired' },
  ];
  if (options?.version) {
    filters.push({ code: 'version', operator: Operator.EQUALS, value: options.version });
  }

  // Need extended mode for meta.project
  const extendedRepo = repo.withOverrideConfig({ extendedMode: true });
  const results = await extendedRepo.searchResources<T>({ resourceType, filters, count: 25 });

  const candidates = options?.ownProjectOnly
    ? results.filter((r) => r.meta?.project === repo.currentProject()?.id)
    : results;
  if (!candidates.length) {
    throw new OperationOutcomeError(badRequest(`${resourceType} ${url} not found`));
  }

  const ranks = projectRanks(repo);
  candidates.sort((a, b) => compareTerminologyResources(a, b, ranks));
  return repo.removeHiddenFields(candidates[0]); // May need to strip extended mode
}

function projectRanks(repo: Repository): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const project of repo.getConfig().projects ?? EMPTY) {
    if (!ranks.has(project.id)) {
      ranks.set(project.id, ranks.size);
    }
  }
  // System repository has no Projects of its own, need to add R4 manually
  if (!ranks.has(r4ProjectId)) {
    ranks.set(r4ProjectId, ranks.size);
  }
  return ranks;
}

function projectRank(resource: TerminologyResource, ranks: Map<string, number>): number {
  const projectId = resource.meta?.project;
  return (projectId ? ranks.get(projectId) : undefined) ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Orders terminology resources so the most preferred candidate sorts first:
 *   1. Project linking order
 *   2. More complete content, for CodeSystems (e.g. 'complete' over 'example')
 *   3. Most current version (missing version = "current")
 *   4. Most recent date (missing date = "current")
 *   5. Resource ID, so that selection is stable
 * @param a - The first resource to compare.
 * @param b - The second resource to compare.
 * @param ranks - Project ranks, by Project ID.
 * @returns A negative number if `a` sorts first, positive if `b` sorts first, or zero if equivalent.
 */
function compareTerminologyResources(
  a: WithId<TerminologyResource>,
  b: WithId<TerminologyResource>,
  ranks: Map<string, number>
): number {
  return (
    projectRank(a, ranks) - projectRank(b, ranks) ||
    contentModeRank(a) - contentModeRank(b) ||
    compareDescending(a.version, b.version) ||
    compareDescending(a.date, b.date) ||
    a.id.localeCompare(b.id)
  );
}

function compareDescending(a: string | undefined, b: string | undefined): number {
  if (a === b) {
    return 0;
  } else if (a === undefined) {
    return -1;
  } else if (b === undefined) {
    return 1;
  }
  return b.localeCompare(a);
}

// Ranks CodeSystem.content by completeness; a lower rank is more complete and therefore preferred.
const CODE_SYSTEM_CONTENT_RANK: Record<string, number> = {
  complete: 0,
  supplement: 1,
  fragment: 2,
  example: 3,
  'not-present': 4,
};

/**
 * Ranks a terminology resource by how complete its content is (lower is more complete/preferred).
 * Only CodeSystem has a content mode; other resource types are all ranked equally.
 * @param resource - The resource to rank.
 * @returns The content rank, where a lower value is more preferred.
 */
function contentModeRank(resource: TerminologyResource): number {
  if (resource.resourceType !== 'CodeSystem' || !resource.content) {
    return 0;
  }
  return CODE_SYSTEM_CONTENT_RANK[resource.content] ?? Number.MAX_SAFE_INTEGER;
}

export function selectCoding(systemId: string, ...code: string[]): SelectQuery {
  return new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('display')
    .column('synonymOf')
    .column('language')
    .where('system', '=', systemId)
    .where('code', 'IN', code);
}

export function canonicalCodingId(tableName: string): Column {
  return new Column(undefined, `COALESCE("${tableName}"."synonymOf", "${tableName}"."id")`, true);
}

export function addPropertyFilter(
  query: SelectQuery,
  condition: ValueSetComposeIncludeFilter,
  property: WithId<CodeSystemProperty>
): SelectQuery {
  const multiValue = condition.op.endsWith('in');
  const values = multiValue ? condition.value.split(',') : condition.value;
  const whereClauses = [
    new Condition(canonicalCodingId(query.effectiveTableName), '=', new Column('Coding_Property', 'coding')),
    new Condition(new Column('Coding_Property', 'property'), '=', property.id),
  ];
  if (condition.op !== 'exists') {
    whereClauses.push(new Condition('value', multiValue ? 'IN' : '=', values));
  }

  const propertyQuery = new SqlFunction('EXISTS', [
    new SelectQuery('Coding_Property').whereExpr(new Conjunction(whereClauses)),
  ]);

  query.whereExpr(
    condition.op === 'exists' && condition.value === 'false' ? new Negation(propertyQuery) : propertyQuery
  );
  return query;
}

export function findAncestor(
  base: SelectQuery,
  codeSystem: CodeSystem,
  property: WithId<CodeSystemProperty>,
  ancestorCode: string
): SelectQuery {
  const query = new SelectQuery('Coding').addColumns(base.columns).where('system', '=', codeSystem.id);
  const propertyTable = query.getNextJoinAlias();
  query.join(
    'INNER JOIN',
    'Coding_Property',
    propertyTable,
    new Conjunction([
      new Condition(new Column('Coding', 'id'), '=', new Column(propertyTable, 'target')),
      new Condition(new Column(propertyTable, 'property'), '=', property.id),
    ])
  );

  const recursiveCTE = 'cte_ancestors';
  const recursiveTable = query.getNextJoinAlias();
  query.join(
    'INNER JOIN',
    recursiveCTE,
    recursiveTable,
    new Disjunction([
      new Condition(new Column(propertyTable, 'coding'), '=', new Column(recursiveTable, 'id')),
      new Condition(new Column(propertyTable, 'coding'), '=', new Column(recursiveTable, 'synonymOf')),
    ])
  );

  return new SelectQuery(recursiveCTE)
    .addColumns(base.columns)
    .withRecursive(recursiveCTE, new Union(base, query))
    .where('code', '=', ancestorCode)
    .limit(1);
}

export function getParentProperty(codeSystem: CodeSystem): CodeSystemProperty {
  if (codeSystem.hierarchyMeaning !== 'is-a') {
    throw new OperationOutcomeError(
      badRequest(`Invalid filter: CodeSystem ${codeSystem.url} does not have an is-a hierarchy`)
    );
  }
  const property = codeSystem.property?.find((p) => p.uri === parentProperty);
  // Implicit parent property for hierarchical CodeSystems
  return property ?? { code: codeSystem.hierarchyMeaning ?? 'parent', uri: parentProperty, type: 'code' };
}

export async function resolveProperty(
  db: PgQueryable,
  codeSystem: WithId<CodeSystem>,
  property: CodeSystemProperty
): Promise<WithId<CodeSystemProperty> | undefined> {
  const query = new SelectQuery('CodeSystem_Property')
    .column('id')
    .where('system', '=', codeSystem.id)
    .where('code', '=', property.code);

  const id: string | undefined = (await query.execute(db))[0]?.id;
  if (id) {
    property.id = id;
    return property as WithId<CodeSystemProperty>;
  } else {
    return undefined;
  }
}

/**
 * Extends a query to select descendants of a given coding.
 * @param query - The query to extend.
 * @param codeSystem - The CodeSystem to query within
 * @param property - The parent (is-a) property for the code system.
 * @param parentCode - The ancestor code, whose descendants are selected.
 * @returns The extended SELECT query.
 */
export function addDescendants(
  query: SelectQuery,
  codeSystem: CodeSystem,
  property: WithId<CodeSystemProperty>,
  parentCode: string
): SelectQuery {
  const base = new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('display')
    .column('synonymOf')
    .column('language')
    .where('system', '=', codeSystem.id)
    .where('code', '=', parentCode);

  const propertyTable = query.getNextJoinAlias();
  const propertyJoinCondition = new Conjunction([
    new Condition(new Column('Coding', 'id'), '=', new Column(propertyTable, 'coding')),
  ]);
  propertyJoinCondition.where(new Column(propertyTable, 'property'), '=', property.id);
  // Provably-true predicate: relationship-property rows always have a positive `target` coding id. Emitting it as a
  // literal (not a bound parameter) lets the planner prove the partial `Coding_Property_reverse_rel_lookup_idx`
  // predicate (`target > 0`) and drive the recursion via a parameterized nested-loop on that index, instead of
  // hash-scanning every row of the parent property on each recursion level.
  propertyJoinCondition.whereExpr(new Constant(`"${propertyTable}"."target" > 0`));
  query.join('INNER JOIN', 'Coding_Property', propertyTable, propertyJoinCondition);

  const recursiveCTE = 'cte_descendants';
  const recursiveTable = query.getNextJoinAlias();
  query.join(
    'INNER JOIN',
    recursiveCTE,
    recursiveTable,
    new Condition(new Column(propertyTable, 'target'), '=', new Column(recursiveTable, 'id'))
  );

  // Move limit and offset to outer query
  const limit = query.limit_;
  query.limit(0);
  const offset = query.offset_;
  query.offset(0);

  return new SelectQuery(recursiveCTE)
    .addColumns(base.columns)
    .withRecursive(recursiveCTE, new Union(base, query))
    .limit(limit)
    .offset(offset);
}

export function uniqueOn<T>(arr: T[], keyFn: (el: T) => string): T[] {
  const seen = Object.create(null);
  for (const el of arr) {
    const key = keyFn(el);
    seen[key] = el;
  }
  return Object.values(seen);
}

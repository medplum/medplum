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
import type { Expression, PgQueryable } from '../../sql';
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

/**
 * Strategy for evaluating an `is-a`/`descendent-of` hierarchy test.
 * - `ancestor`: correlated `EXISTS(findAncestor …)` per candidate row — best for selective text filters, where the
 *   candidate set is small and walking up the hierarchy is cheaper than materializing the whole subtree.
 * - `descendant`: materialize the subtree once and test membership by id — best for broad/no filters.
 */
export type ParentFilterStrategy = 'ancestor' | 'descendant';

/**
 * Candidate-count crossover for choosing between the `ancestor` and `descendant` strategies, tuned to the
 * UMLS dataset: on a ~100k+ subtree the per-candidate ancestor walk costs ~60x the per-descendant enumeration,
 * so materializing the subtree is more performant once the filter matches >3000 candidate codes.
 */
export const PARENT_FILTER_THRESHOLD = 3000;

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
 * Ranks a terminology resource by how complete its content is.
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

/**
 * Builds the correlated `EXISTS(SELECT 1 FROM Coding_Property ...)` predicate for a property filter.
 * @param tableName - Table/alias whose `id` column identifies the base Coding row (e.g. `Coding` or a CTE).
 * @param condition - The property filter to translate.
 * @param property - The resolved CodeSystem property.
 * @returns The boolean predicate expression.
 */
export function buildPropertyFilterExpression(
  tableName: string,
  condition: ValueSetComposeIncludeFilter,
  property: WithId<CodeSystemProperty>
): Expression {
  const multiValue = condition.op.endsWith('in');
  const values = multiValue ? condition.value.split(',') : condition.value;
  const whereClauses = [
    new Condition(new Column(tableName, 'id'), '=', new Column('Coding_Property', 'coding')),
    new Condition(new Column('Coding_Property', 'property'), '=', property.id),
  ];
  if (condition.op !== 'exists') {
    whereClauses.push(new Condition('value', multiValue ? 'IN' : '=', values));
  }

  const propertyQuery = new SqlFunction('EXISTS', [
    new SelectQuery('Coding_Property').whereExpr(new Conjunction(whereClauses)),
  ]);

  return condition.op === 'exists' && condition.value === 'false' ? new Negation(propertyQuery) : propertyQuery;
}

export function addPropertyFilter(
  query: SelectQuery,
  condition: ValueSetComposeIncludeFilter,
  property: WithId<CodeSystemProperty>
): SelectQuery {
  query.whereExpr(buildPropertyFilterExpression(query.effectiveTableName, condition, property));
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
 * @param cteName - Name of the recursive CTE.
 * @returns The extended SELECT query.
 */
export function addDescendants(
  query: SelectQuery,
  codeSystem: CodeSystem,
  property: WithId<CodeSystemProperty>,
  parentCode: string,
  cteName = 'cte_descendants'
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
  // Relationship-property rows always have a positive `target` ID, which is emitted as a literal so the planner can use
  // the correct partial index. This allows the recursive query to use a parameterized nested-loop on that index, instead of
  // hash-scanning every row of the parent property on each recursion level
  propertyJoinCondition.whereExpr(new Constant(`"${propertyTable}"."target" > 0`));
  query.join('INNER JOIN', 'Coding_Property', propertyTable, propertyJoinCondition);

  const recursiveCTE = cteName;
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

/**
 * Translates a single referenced `include.filter` into a membership predicate over base system X.
 * @param baseCodeSystem - The base CodeSystem X (hydrated).
 * @param baseTableName - Table/alias of the base row.
 * @param filter - The filter to translate.
 * @param strategy - Whether to test hierarchy membership by a correlated `ancestor` walk
 *   (for selective text filters) or a materialized `descendant` subtree semi-join (default).
 * @returns The predicate, or `undefined` if the filter op or property cannot be translated.
 * @throws On unsupported operators, which cannot be expanded efficiently against large code systems;
 *   and for a hierarchy filter whose CodeSystem is not an is-a hierarchy
 */
export function buildFilterMembershipExpression(
  baseCodeSystem: WithId<CodeSystem>,
  baseTableName: string,
  filter: ValueSetComposeIncludeFilter,
  strategy?: ParentFilterStrategy
): Expression | undefined {
  switch (filter.op) {
    // `regex`, `is-not-a`, and `not-in` are intentionally unsupported due to performance concerns with expanding these expensive filters
    // No currently-referenced base FHIR or US Core ValueSet depends on these filters
    case 'regex':
    case 'is-not-a':
    case 'not-in':
      throw new OperationOutcomeError(
        badRequest(
          `Unsupported ValueSet filter operation "${filter.op}" (CodeSystem ${baseCodeSystem.url}): this operator cannot be expanded efficiently and is not supported`
        )
      );
    case 'is-a':
    case 'descendent-of': {
      if (strategy === 'ancestor') {
        // Selective text filter: test ancestry per candidate row in the trigram-narrowed result set
        return buildAncestorMembershipExpression(
          baseCodeSystem,
          baseTableName,
          filter.value,
          filter.op === 'descendent-of'
        );
      }
      // Hierarchy semi-join: materialize the referenced subtree once (its own recursive CTE) and test membership by ID
      const idSubquery = buildSubtreeIdSubquery(baseCodeSystem, filter.value, filter.op === 'descendent-of');
      if (!idSubquery) {
        return undefined;
      }
      return new Condition(new Column(baseTableName, 'id'), 'IN_SUBQUERY', idSubquery);
    }
    case 'generalizes': {
      // `generalizes` selects the provided code and all of its ancestors, which should be a bounded set
      const idSubquery = buildAncestorIdSubquery(baseCodeSystem, filter.value);
      if (!idSubquery) {
        return undefined;
      }
      return new Condition(new Column(baseTableName, 'id'), 'IN_SUBQUERY', idSubquery);
    }
    case '=':
    case 'in':
    case 'exists': {
      const property = baseCodeSystem.property?.find((p) => p.code === filter.property);
      if (!property?.id) {
        return undefined;
      }
      return buildPropertyFilterExpression(baseTableName, filter, property as WithId<CodeSystemProperty>);
    }
    default:
      return undefined;
  }
}

/**
 * Builds an `id`-selecting subquery for the hierarchy subtree rooted at `code` within the given CodeSystem,
 * wrapped so its recursive CTE is scoped and cannot collide with sibling subtrees in the same query.
 * @param baseCodeSystem - The (hydrated) CodeSystem to enumerate within.
 * @param code - The root code whose descendants are selected.
 * @param excludeSelf - When true (i.e. `descendent-of`), the root code itself is excluded.
 * @returns The `id` subquery, or `undefined` if the is-a hierarchy's parent property is unavailable.
 * @throws When the CodeSystem is not an `is-a` hierarchy.
 */
function buildSubtreeIdSubquery(
  baseCodeSystem: WithId<CodeSystem>,
  code: string,
  excludeSelf: boolean
): SelectQuery | undefined {
  const parentProperty = getParentProperty(baseCodeSystem);
  if (!parentProperty.id) {
    return undefined;
  }
  const memberQuery = new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('display')
    .column('synonymOf')
    .column('language')
    .where('system', '=', baseCodeSystem.id);
  const subtree = addDescendants(
    memberQuery,
    baseCodeSystem,
    parentProperty as WithId<CodeSystemProperty>,
    code,
    'cte_member'
  );
  if (excludeSelf) {
    subtree.where(new Column(subtree.effectiveTableName, 'code'), '!=', code);
  }
  return new SelectQuery('member_subtree', subtree).column('id');
}

/**
 * Builds a correlated membership predicate that checks if a base-system candidate row has `code` is one of its
 * ancestors  by walking up the hierarchy from that candidate. Unlike {@link buildSubtreeIdSubquery}, its cost scales
 * with the number of candidate rows, so it is preferred once a selective text filter has already narrowed the candidates.
 * @param baseCodeSystem - The (hydrated) base CodeSystem the candidate rows belong to.
 * @param baseTableName - Table/alias of the candidate row (`Coding` or a descendant CTE).
 * @param code - The ancestor code whose descendants are members.
 * @param excludeSelf - When true (i.e. `descendent-of`), the root code itself is excluded.
 * @returns The membership predicate, or `undefined` if the is-a hierarchy's parent property is unavailable.
 * @throws When the CodeSystem is not an is-a hierarchy.
 */
export function buildAncestorMembershipExpression(
  baseCodeSystem: WithId<CodeSystem>,
  baseTableName: string,
  code: string,
  excludeSelf: boolean
): Expression | undefined {
  const parentProperty = getParentProperty(baseCodeSystem);
  if (!parentProperty.id) {
    return undefined;
  }
  const base = new SelectQuery('Coding', undefined, 'origin')
    .column('id')
    .column('code')
    .column('display')
    .column('synonymOf')
    .column('language')
    .where(new Column('origin', 'system'), '=', baseCodeSystem.id)
    .where(new Column('origin', 'code'), '=', new Column(baseTableName, 'code'));
  const ancestorQuery = findAncestor(base, baseCodeSystem, parentProperty as WithId<CodeSystemProperty>, code);
  const exists: Expression = new SqlFunction('EXISTS', [ancestorQuery]);
  return excludeSelf ? new Conjunction([exists, new Condition(new Column(baseTableName, 'code'), '!=', code)]) : exists;
}

/**
 * Builds an `id`-selecting subquery for `code` together with all of its ancestors within the given CodeSystem by walking up the parent relationship.
 * @param baseCodeSystem - The (hydrated) CodeSystem to enumerate within.
 * @param code - The code whose ancestors (and itself) are selected.
 * @returns The `id` subquery, or `undefined` if the is-a hierarchy's parent property is unavailable.
 * @throws When the CodeSystem is not an is-a hierarchy.
 */
function buildAncestorIdSubquery(baseCodeSystem: WithId<CodeSystem>, code: string): SelectQuery | undefined {
  const parentProperty = getParentProperty(baseCodeSystem);
  if (!parentProperty.id) {
    return undefined;
  }
  const cteName = 'cte_ancestor';
  const base = new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('synonymOf')
    .where('system', '=', baseCodeSystem.id)
    .where('code', '=', code);

  // Recursive step: for each node already collected, join up to its parent
  const step = new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('synonymOf')
    .where('system', '=', baseCodeSystem.id);
  const propertyTable = step.getNextJoinAlias();
  const propertyJoin = new Conjunction([
    new Condition(new Column('Coding', 'id'), '=', new Column(propertyTable, 'target')),
    new Condition(new Column(propertyTable, 'property'), '=', parentProperty.id),
    new Constant(`"${propertyTable}"."target" > 0`),
  ]);
  step.join('INNER JOIN', 'Coding_Property', propertyTable, propertyJoin);
  const recursiveTable = step.getNextJoinAlias();
  step.join(
    'INNER JOIN',
    cteName,
    recursiveTable,
    new Condition(new Column(propertyTable, 'coding'), '=', new Column(recursiveTable, 'id'))
  );

  const cte = new SelectQuery(cteName).column('id').withRecursive(cteName, new Union(base, step));
  return new SelectQuery('ancestor_set', cte).column('id');
}

export function uniqueOn<T>(arr: T[], keyFn: (el: T) => string): T[] {
  const seen = Object.create(null);
  for (const el of arr) {
    const key = keyFn(el);
    seen[key] = el;
  }
  return Object.values(seen);
}

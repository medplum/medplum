// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter, WithId } from '@medplum/core';
import { badRequest, createReference, OperationOutcomeError, Operator, resolveId } from '@medplum/core';
import type {
  CodeSystem,
  CodeSystemProperty,
  ConceptMap,
  Reference,
  ValueSet,
  ValueSetComposeInclude,
  ValueSetComposeIncludeFilter,
  ValueSetExpansionContains,
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
  const project = repo.currentProject();

  const versionDelim = url.lastIndexOf('|');
  if (versionDelim > 0) {
    url = url.slice(0, versionDelim);
    options = { ...options, version: options?.version ?? url.slice(versionDelim + 1) };
  }

  const filters: Filter[] = [
    { code: 'url', operator: Operator.EQUALS, value: url },
    // Exclude retired (i.e. deactivated) resources from selection entirely
    { code: 'status', operator: Operator.NOT_EQUALS, value: 'retired' },
  ];
  if (options?.version) {
    filters.push({ code: 'version', operator: Operator.EQUALS, value: options.version });
  }

  const results = await repo.searchResources<T>({
    resourceType,
    filters,
  });

  // Sort candidates in code (rather than via SQL sort rules) so we have fine-grained control over
  // the ordering: preferring the most current version, then more complete content (e.g. a
  // 'complete' CodeSystem over an 'example' one), then the most recent date. Doing this in code
  // leaves room to compare versions with e.g. semver semantics in the future.
  results.sort(compareTerminologyResources);

  const systemRepo = repo.getSystemRepo();
  if (!results.length) {
    throw new OperationOutcomeError(badRequest(`${resourceType} ${url} not found`));
  } else if (results.length === 1 || !sameTerminologyResourceVersion(results[0], results[1])) {
    if (options?.ownProjectOnly) {
      const fullResource = await systemRepo.readReference(createReference(results[0]));
      if (fullResource.meta?.project === repo.currentProject()?.id) {
        return results[0];
      }
    } else {
      return results[0];
    }
  } else {
    const resourceReferences: Reference<T>[] = [];
    for (const resource of results) {
      resourceReferences.push(createReference(resource));
    }
    const resources = await systemRepo.readReferences(resourceReferences);
    const projectResource = resources.find((r) => r instanceof Error || (project && r.meta?.project === project.id));
    if (projectResource instanceof Error) {
      throw projectResource;
    } else if (projectResource) {
      return projectResource;
    }
    if (!options?.ownProjectOnly && project?.link) {
      for (const linkedProject of project.link) {
        const linkedResource = resources.find(
          (r) => !(r instanceof Error) && r.meta?.project === resolveId(linkedProject.project)
        ) as WithId<T> | undefined;
        if (linkedResource) {
          return linkedResource;
        }
      }
    }
    const baseResource = resources.find((r) => r instanceof Error || r.meta?.project === r4ProjectId);
    if (baseResource instanceof Error) {
      throw baseResource;
    } else if (baseResource) {
      return baseResource;
    }
  }
  throw new OperationOutcomeError(badRequest(`${resourceType} ${url} not found`));
}

function sameTerminologyResourceVersion(a: TerminologyResource, b: TerminologyResource): boolean {
  return a.version === b.version && a.date === b.date;
}

/**
 * Orders terminology resources so the most preferred candidate sorts first. Preference is, in order:
 *   1. Most current version (a missing version is assumed to be "current")
 *   2. More complete content, for CodeSystems (e.g. 'complete' over 'example')
 *   3. Most recent date (a missing date is assumed to be "current")
 * @param a - The first resource to compare.
 * @param b - The second resource to compare.
 * @returns A negative number if `a` sorts first, positive if `b` sorts first, or zero if equivalent.
 */
function compareTerminologyResources(a: TerminologyResource, b: TerminologyResource): number {
  const byVersion = compareDescendingWithMissingFirst(a.version, b.version);
  if (byVersion !== 0) {
    return byVersion;
  }

  const byContent = contentModeRank(a) - contentModeRank(b);
  if (byContent !== 0) {
    return byContent;
  }

  return compareDescendingWithMissingFirst(a.date, b.date);
}

/**
 * Compares two optional strings for a descending sort, treating a missing value as the greatest
 * (i.e. sorted first). Comparison of present values is lexical, matching the previous SQL sort.
 * @param a - The first value to compare.
 * @param b - The second value to compare.
 * @returns A negative number if `a` sorts first, positive if `b` sorts first, or zero if equal.
 */
function compareDescendingWithMissingFirst(a: string | undefined, b: string | undefined): number {
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
  fragment: 1,
  example: 2,
  supplement: 3,
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

/**
 * Builds the correlated `EXISTS(SELECT 1 FROM Coding_Property …)` predicate for a `=`/`in`/`exists` property
 * filter, correlated to the `id` column of the given base table. Factored out of {@link addPropertyFilter} so the
 * same predicate can be ANDed into a ValueSet membership check without mutating a query.
 * @param tableName - Table/alias whose `id` column identifies the base Coding row (e.g. `Coding` or a CTE).
 * @param condition - The property filter to translate.
 * @param property - The resolved CodeSystem property (with database id).
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
 * @param cteName - Name of the recursive CTE. Override when nesting a subtree inside another descendant query
 *   (e.g. a membership check ANDed into a subtree expansion) so the inner and outer CTEs don't collide.
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
  // Provably-true predicate: relationship-property rows always have a positive `target` coding id. Emitting it as a
  // literal (not a bound parameter) lets the planner prove the partial `Coding_Property_reverse_rel_lookup_idx`
  // predicate (`target > 0`) and drive the recursion via a parameterized nested-loop on that index, instead of
  // hash-scanning every row of the parent property on each recursion level.
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
 * Builds a predicate that is TRUE for a base `Coding` row (from `baseCodeSystem`, i.e. system X) if and only if
 * that code is a member of the `referenced` ValueSet, restricted to system X.
 *
 * The base `$expand` query always roots at `FROM Coding WHERE system = X`, so every candidate row already has
 * system X. Membership therefore reduces to an index-driven predicate on that same `(system, code)` row:
 *   - `concept` lists become `code IN (…)`
 *   - `=`/`in`/`exists` filters become correlated `EXISTS(Coding_Property …)`
 *   - `is-a`/`descendent-of` filters become a semi-join against a materialized subtree (`id = ANY(subtree)`)
 *   - nested `valueSet` references recurse and AND their predicates in
 * ANDing the result into the base query keeps Postgres's indexes, ordering, and `LIMIT` on the true
 * intersection — no in-memory materialization, and no silent truncation.
 *
 * Fail-safe: if any criterion cannot be faithfully translated (unknown filter op, unresolved hierarchy property,
 * or a large/truncated pre-expansion), the whole predicate is `undefined`. Under-translating would silently drop
 * valid intersection members, so the caller must instead yield an empty result for the include. A `referenced`
 * set that genuinely has no system-X members yields a `FALSE` predicate (a correct empty result, not a failure).
 * @param repo - Repository used to resolve nested ValueSet references.
 * @param baseCodeSystem - The base CodeSystem X (already hydrated), whose rows the predicate is evaluated against.
 * @param baseTableName - Table/alias of the base row in the surrounding query (`Coding` or a descendant CTE).
 * @param referenced - The referenced ValueSet whose membership is being tested.
 * @param terminologyResources - Resolution chain, used for cycle detection across nested ValueSet references.
 * @returns The membership predicate, or `undefined` if it cannot be faithfully translated (fail-safe).
 */
export async function buildValueSetMembershipPredicate(
  repo: Repository,
  baseCodeSystem: WithId<CodeSystem>,
  baseTableName: string,
  referenced: WithId<ValueSet>,
  terminologyResources: Record<string, WithId<CodeSystem> | WithId<ValueSet>>
): Promise<Expression | undefined> {
  if (!referenced.compose?.include?.length) {
    // No logical definition; fall back to a pre-computed expansion if one is fully materialized
    const contains = referenced.expansion?.contains;
    if (!contains?.length) {
      return undefined; // Nothing usable to translate → fail safe
    }
    if (referenced.expansion?.total && referenced.expansion.total > contains.length) {
      return undefined; // Truncated/partial pre-expansion → fail safe rather than under-count
    }
    const codes = collectSystemCodes(contains, baseCodeSystem.url as string);
    return codes.length ? new Condition(new Column(baseTableName, 'code'), 'IN', codes) : FALSE_PREDICATE;
  }

  const includeTerms: Expression[] = [];
  for (const include of referenced.compose.include) {
    const term = await buildIncludeMembershipTerm(repo, baseCodeSystem, baseTableName, include, terminologyResources);
    if (term === undefined) {
      return undefined; // Untranslatable include → fail safe for the whole predicate
    }
    if (term !== null) {
      includeTerms.push(term);
    }
  }

  if (!includeTerms.length) {
    return FALSE_PREDICATE; // No include contributes a system-X member → correct empty result
  }
  return includeTerms.length === 1 ? includeTerms[0] : new Disjunction(includeTerms);
}

/** A predicate that is never true, used when a referenced ValueSet has no members in the base system. */
const FALSE_PREDICATE = new Constant('FALSE');

/**
 * Translates a single `compose.include` of a referenced ValueSet into a membership term over base system X.
 * @param repo - Repository used to resolve nested ValueSet references.
 * @param baseCodeSystem - The base CodeSystem X.
 * @param baseTableName - Table/alias of the base row.
 * @param include - The referenced include to translate.
 * @param terminologyResources - Resolution chain for cycle detection.
 * @returns An expression term, `null` if the include cannot contain any system-X code (skip it), or `undefined`
 *   if it cannot be faithfully translated (fail safe).
 */
async function buildIncludeMembershipTerm(
  repo: Repository,
  baseCodeSystem: WithId<CodeSystem>,
  baseTableName: string,
  include: ValueSetComposeInclude,
  terminologyResources: Record<string, WithId<CodeSystem> | WithId<ValueSet>>
): Promise<Expression | null | undefined> {
  const conjuncts: Expression[] = [];

  if (include.system) {
    if (include.system !== baseCodeSystem.url) {
      // A base row always has system X, so an include pinned to a different system can never match it
      return null;
    }
    if (include.concept?.length) {
      conjuncts.push(
        new Condition(
          new Column(baseTableName, 'code'),
          'IN',
          include.concept.map((c) => c.code)
        )
      );
    }
    for (const filter of include.filter ?? []) {
      const expr = buildFilterMembershipExpression(baseCodeSystem, baseTableName, filter);
      if (!expr) {
        return undefined;
      }
      conjuncts.push(expr);
    }
  } else if (!include.valueSet?.length) {
    return undefined; // Neither system nor valueSet → nothing to translate
  }

  for (const url of include.valueSet ?? []) {
    if (terminologyResources[url]) {
      throw new OperationOutcomeError(badRequest(`Recursive ValueSet reference: ${url}`));
    }
    const nested = await findTerminologyResource<ValueSet>(repo, 'ValueSet', url);
    const marker = (nested.url as string) ?? url;
    if (terminologyResources[marker]) {
      throw new OperationOutcomeError(badRequest(`Recursive ValueSet reference: ${marker}`));
    }
    terminologyResources[marker] = nested;
    try {
      const nestedPred = await buildValueSetMembershipPredicate(
        repo,
        baseCodeSystem,
        baseTableName,
        nested,
        terminologyResources
      );
      if (!nestedPred) {
        return undefined;
      }
      conjuncts.push(nestedPred);
    } finally {
      delete terminologyResources[marker];
    }
  }

  if (!conjuncts.length) {
    return null;
  }
  return conjuncts.length === 1 ? conjuncts[0] : new Conjunction(conjuncts);
}

/**
 * Translates a single referenced `include.filter` into a membership predicate over base system X.
 * @param baseCodeSystem - The base CodeSystem X (hydrated).
 * @param baseTableName - Table/alias of the base row.
 * @param filter - The filter to translate.
 * @returns The predicate, or `undefined` if the filter op or property cannot be translated (fail safe).
 */
function buildFilterMembershipExpression(
  baseCodeSystem: WithId<CodeSystem>,
  baseTableName: string,
  filter: ValueSetComposeIncludeFilter
): Expression | undefined {
  switch (filter.op) {
    case 'is-a':
    case 'descendent-of': {
      if (baseCodeSystem.hierarchyMeaning !== 'is-a') {
        return undefined;
      }
      const parentProperty = getParentProperty(baseCodeSystem);
      if (!parentProperty.id) {
        return undefined;
      }
      // Materialize the referenced subtree once (its own recursive CTE) and semi-join by id
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
        filter.value,
        'cte_member'
      );
      if (filter.op !== 'is-a') {
        subtree.where(new Column(subtree.effectiveTableName, 'code'), '!=', filter.value);
      }
      const idSubquery = new SelectQuery('member_subtree', subtree).column('id');
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
 * Collects the codes belonging to a given system from a (possibly nested) pre-computed expansion.
 * @param contains - The `expansion.contains` entries to scan.
 * @param system - The system URL to collect codes for.
 * @returns The matching codes.
 */
function collectSystemCodes(contains: ValueSetExpansionContains[], system: string): string[] {
  const codes: string[] = [];
  for (const c of contains) {
    if (c.contains?.length) {
      codes.push(...collectSystemCodes(c.contains, system));
    }
    if (c.system === system && c.code) {
      codes.push(c.code);
    }
  }
  return codes;
}

export function uniqueOn<T>(arr: T[], keyFn: (el: T) => string): T[] {
  const seen = Object.create(null);
  for (const el of arr) {
    const key = keyFn(el);
    seen[key] = el;
  }
  return Object.values(seen);
}

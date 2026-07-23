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

export function addPropertyFilter(
  query: SelectQuery,
  condition: ValueSetComposeIncludeFilter,
  property: WithId<CodeSystemProperty>
): SelectQuery {
  const multiValue = condition.op.endsWith('in');
  const values = multiValue ? condition.value.split(',') : condition.value;
  const whereClauses = [
    new Condition(new Column(query.effectiveTableName, 'id'), '=', new Column('Coding_Property', 'coding')),
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

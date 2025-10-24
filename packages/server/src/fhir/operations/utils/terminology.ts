// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { OperationOutcomeError, Operator, badRequest, createReference, resolveId } from '@medplum/core';
import type {
  CodeSystem,
  CodeSystemProperty,
  ConceptMap,
  Reference,
  ValueSet,
  ValueSetComposeIncludeFilter,
} from '@medplum/fhirtypes';
import type { Pool, PoolClient } from 'pg';
import { getAuthenticatedContext } from '../../../context';
import { getSystemRepo } from '../../repo';
import { Column, Condition, Conjunction, Disjunction, SelectQuery, SqlFunction, Union } from '../../sql';

export const parentProperty = 'http://hl7.org/fhir/concept-properties#parent';
export const childProperty = 'http://hl7.org/fhir/concept-properties#child';
export const abstractProperty = 'http://hl7.org/fhir/concept-properties#notSelectable';

export type TerminologyResource = CodeSystem | ValueSet | ConceptMap;

export async function findTerminologyResource<T extends TerminologyResource>(
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
  const { repo, project } = getAuthenticatedContext();

  const versionDelim = url.lastIndexOf('|');
  if (versionDelim > 0) {
    url = url.slice(0, versionDelim);
    options = { ...options, version: options?.version ?? url.slice(versionDelim + 1) };
  }

  const filters = [{ code: 'url', operator: Operator.EQUALS, value: url }];
  if (options?.version) {
    filters.push({ code: 'version', operator: Operator.EQUALS, value: options.version });
  }
  const results = await repo.searchResources<T>({
    resourceType,
    filters,
    sortRules: [
      // Select highest version (by lexical sort -- no version is assumed to be "current")
      { code: 'version', descending: true },
      // Break ties by selecting more recently-updated resource (lexically -- no date is assumed to be current)
      { code: 'date', descending: true },
    ],
  });

  if (!results.length) {
    throw new OperationOutcomeError(badRequest(`${resourceType} ${url} not found`));
  } else if (results.length === 1 || !sameTerminologyResourceVersion(results[0], results[1])) {
    if (options?.ownProjectOnly) {
      const fullResource = await getSystemRepo().readReference(createReference(results[0]));
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
    const resources = await getSystemRepo().readReferences(resourceReferences);
    const projectResource = resources.find((r) => r instanceof Error || r.meta?.project === project.id);
    if (projectResource instanceof Error) {
      throw projectResource;
    } else if (projectResource) {
      return projectResource;
    }
    if (!options?.ownProjectOnly && project.link) {
      for (const linkedProject of project.link) {
        const linkedResource = resources.find(
          (r) => !(r instanceof Error) && r.meta?.project === resolveId(linkedProject.project)
        ) as WithId<T> | undefined;
        if (linkedResource) {
          return linkedResource;
        }
      }
    }
  }
  throw new OperationOutcomeError(badRequest(`${resourceType} ${url} not found`));
}

function sameTerminologyResourceVersion(a: TerminologyResource, b: TerminologyResource): boolean {
  if (a.version !== b.version) {
    return false;
  } else if (a.date !== b.date) {
    return false;
  }
  return true;
}

export function selectCoding(systemId: string, ...code: string[]): SelectQuery {
  return new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('display')
    .column('synonymOf')
    .where('system', '=', systemId)
    .where('code', 'IN', code)
    .where('synonymOf', '=', null);
}

export function addPropertyFilter(
  query: SelectQuery,
  condition: ValueSetComposeIncludeFilter,
  property: WithId<CodeSystemProperty>
): SelectQuery {
  const multiValue = condition.op.endsWith('in');
  const values = multiValue ? condition.value.split(',') : condition.value;
  const propertyQuery = new SelectQuery('Coding_Property').whereExpr(
    new Conjunction([
      new Condition(new Column(query.effectiveTableName, 'id'), '=', new Column('Coding_Property', 'coding')),
      new Condition(new Column('Coding_Property', 'property'), '=', property.id),
      new Condition('value', multiValue ? 'IN' : '=', values),
    ])
  );

  query.whereExpr(new SqlFunction('EXISTS', [propertyQuery]));
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
  let property = codeSystem.property?.find((p) => p.uri === parentProperty);
  if (!property) {
    // Implicit parent property for hierarchical CodeSystems
    property = { code: codeSystem.hierarchyMeaning ?? 'parent', uri: parentProperty, type: 'code' };
  }
  return property;
}

export async function resolveProperty(
  db: Pool | PoolClient,
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
    .where('system', '=', codeSystem.id)
    .where('code', '=', parentCode);

  const propertyTable = query.getNextJoinAlias();
  const propertyJoinCondition = new Conjunction([
    new Condition(new Column('Coding', 'id'), '=', new Column(propertyTable, 'coding')),
  ]);
  propertyJoinCondition.where(new Column(propertyTable, 'property'), '=', property.id);
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

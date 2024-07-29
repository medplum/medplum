import { OperationOutcomeError, Operator, badRequest, createReference, resolveId } from '@medplum/core';
import { getAuthenticatedContext } from '../../../context';
import { CodeSystem, CodeSystemProperty, ConceptMap, Reference, ValueSet } from '@medplum/fhirtypes';
import { SelectQuery, Conjunction, Condition, Column, Union } from '../../sql';
import { getSystemRepo } from '../../repo';

export const parentProperty = 'http://hl7.org/fhir/concept-properties#parent';
export const childProperty = 'http://hl7.org/fhir/concept-properties#child';
export const abstractProperty = 'http://hl7.org/fhir/concept-properties#notSelectable';

export type TerminologyResource = CodeSystem | ValueSet | ConceptMap;

export async function findTerminologyResource<T extends TerminologyResource>(
  resourceType: T['resourceType'],
  url: string,
  version?: string
): Promise<T> {
  const { repo, project } = getAuthenticatedContext();
  const filters = [{ code: 'url', operator: Operator.EQUALS, value: url }];
  if (version) {
    filters.push({ code: 'version', operator: Operator.EQUALS, value: version });
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
    return results[0];
  } else {
    const resourceReferences: Reference<T>[] = [];
    for (const resource of results) {
      resourceReferences.push(createReference(resource));
    }
    const resources = (await getSystemRepo().readReferences(resourceReferences)) as (T | Error)[];
    const projectResource = resources.find((r) => r instanceof Error || r.meta?.project === project.id);
    if (projectResource instanceof Error) {
      throw projectResource;
    } else if (projectResource) {
      return projectResource;
    }
    if (project.link) {
      for (const linkedProject of project.link) {
        const linkedResource = resources.find(
          (r) => !(r instanceof Error) && r.meta?.project === resolveId(linkedProject.project)
        ) as T | undefined;
        if (linkedResource) {
          return linkedResource;
        }
      }
    }
    throw new OperationOutcomeError(badRequest(`${resourceType} ${url} not found`));
  }
}

function sameTerminologyResourceVersion(a: TerminologyResource, b: TerminologyResource): boolean {
  if (a.version !== b.version) {
    return false;
  } else if (a.date !== b.date) {
    return false;
  }
  return true;
}

export function addPropertyFilter(query: SelectQuery, property: string, value: string, isEqual?: boolean): SelectQuery {
  const propertyTable = query.getNextJoinAlias();
  query.leftJoin(
    'Coding_Property',
    propertyTable,
    new Conjunction([
      new Condition(new Column(query.tableName, 'id'), '=', new Column(propertyTable, 'coding')),
      new Condition(new Column(propertyTable, 'value'), '=', value),
    ])
  );

  const csPropertyTable = query.getNextJoinAlias();
  query.leftJoin(
    'CodeSystem_Property',
    csPropertyTable,
    new Conjunction([
      new Condition(new Column('Coding', 'system'), '=', new Column(csPropertyTable, 'system')),
      new Condition(new Column(csPropertyTable, 'id'), '=', new Column(propertyTable, 'property')),
      new Condition(new Column(csPropertyTable, 'code'), '=', property),
    ])
  );

  query
    .where(new Column(propertyTable, 'value'), isEqual ? '!=' : '=', null)
    .where(new Column(csPropertyTable, 'system'), isEqual ? '!=' : '=', null);
  return query;
}

export function findAncestor(base: SelectQuery, codeSystem: CodeSystem, ancestorCode: string): SelectQuery {
  const property = getParentProperty(codeSystem);

  const query = new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('display')
    .where('system', '=', codeSystem.id);
  const propertyTable = query.getNextJoinAlias();
  query.innerJoin(
    'Coding_Property',
    propertyTable,
    new Condition(new Column('Coding', 'id'), '=', new Column(propertyTable, 'target'))
  );

  const csPropertyTable = query.getNextJoinAlias();
  query.innerJoin(
    'CodeSystem_Property',
    csPropertyTable,
    new Conjunction([
      new Condition(new Column(propertyTable, 'property'), '=', new Column(csPropertyTable, 'id')),
      new Condition(new Column(csPropertyTable, 'code'), '=', property.code),
    ])
  );

  const recursiveCTE = 'cte_ancestors';
  const recursiveTable = query.getNextJoinAlias();
  query.innerJoin(
    recursiveCTE,
    recursiveTable,
    new Condition(new Column(propertyTable, 'coding'), '=', new Column(recursiveTable, 'id'))
  );

  return new SelectQuery(recursiveCTE)
    .column('code')
    .column('display')
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

/**
 * Extends a query to select descendants of a given coding.
 * @param query - The query to extend.
 * @param codeSystem - The CodeSystem to query within
 * @param parentCode - The ancestor code, whose descendants are selected.
 * @returns The extended SELECT query.
 */
export function addDescendants(query: SelectQuery, codeSystem: CodeSystem, parentCode: string): SelectQuery {
  const property = getParentProperty(codeSystem);

  const base = new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('display')
    .where('system', '=', codeSystem.id)
    .where('code', '=', parentCode);

  const propertyTable = query.getNextJoinAlias();
  const propertyJoinCondition = new Conjunction([
    new Condition(new Column('Coding', 'id'), '=', new Column(propertyTable, 'coding')),
  ]);
  if (property.id) {
    propertyJoinCondition.where(new Column(propertyTable, 'property'), '=', property.id);
  }
  query.innerJoin('Coding_Property', propertyTable, propertyJoinCondition);

  if (!property.id) {
    const csPropertyTable = query.getNextJoinAlias();
    query.innerJoin(
      'CodeSystem_Property',
      csPropertyTable,
      new Conjunction([
        new Condition(new Column(propertyTable, 'property'), '=', new Column(csPropertyTable, 'id')),
        new Condition(new Column(csPropertyTable, 'code'), '=', property.code),
      ])
    );
  }

  const recursiveCTE = 'cte_descendants';
  const recursiveTable = query.getNextJoinAlias();
  query.innerJoin(
    recursiveCTE,
    recursiveTable,
    new Condition(new Column(propertyTable, 'target'), '=', new Column(recursiveTable, 'id'))
  );

  // Move limit and offset to outer query
  const limit = query.limit_;
  query.limit(0);
  const offset = query.offset_;
  query.offset(0);

  return new SelectQuery('cte_descendants')
    .column('id')
    .column('code')
    .column('display')
    .withRecursive('cte_descendants', new Union(base, query))
    .limit(limit)
    .offset(offset);
}

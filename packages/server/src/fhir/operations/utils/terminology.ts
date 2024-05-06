import { OperationOutcomeError, Operator, badRequest, createReference } from '@medplum/core';
import { getAuthenticatedContext } from '../../../context';
import { r4ProjectId } from '../../../seed';
import { CodeSystem, CodeSystemConceptProperty, ConceptMap, Reference, ValueSet } from '@medplum/fhirtypes';
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
  } else if (results.length === 1) {
    return results[0];
  } else {
    const resourceReferences: Reference<T>[] = [];
    const projectOrdering: string[] = [project.id as string];
    for (const resource of results) {
      resourceReferences.push(createReference(resource));
    }
    if (project.link?.length) {
      for (const linkedProject of project.link) {
        const projectId = linkedProject.project.reference?.split('/')?.[1];
        if (projectId) {
          projectOrdering.push(projectId);
        }
      }
    }
    projectOrdering.push(r4ProjectId);

    const resources = (await getSystemRepo().readReferences(resourceReferences)) as (T | Error)[];
    resources.sort((a: T | Error, b: T | Error) => {
      if (a instanceof Error) {
        throw a;
      } else if (b instanceof Error) {
        throw b;
      }
      return projectOrdering.indexOf(a.meta?.project as string) - projectOrdering.indexOf(b.meta?.project as string);
    });
    return resources[0] as T;
  }
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
      new Condition(new Column(propertyTable, 'property'), '=', new Column(csPropertyTable, 'id')),
      new Condition(new Column(csPropertyTable, 'code'), '=', property),
    ])
  );
  query.where(new Column(csPropertyTable, 'id'), isEqual ? '!=' : '=', null);
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

export function getParentProperty(codeSystem: CodeSystem): CodeSystemConceptProperty {
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

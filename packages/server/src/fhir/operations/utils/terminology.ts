import { OperationOutcomeError, Operator, badRequest } from '@medplum/core';
import { getAuthenticatedContext } from '../../../context';
import { r4ProjectId } from '../../../seed';
import { CodeSystem, ConceptMap, ValueSet } from '@medplum/fhirtypes';
import { SelectQuery, Conjunction, Condition, Column } from '../../sql';

export const parentProperty = 'http://hl7.org/fhir/concept-properties#parent';
export const childProperty = 'http://hl7.org/fhir/concept-properties#child';
export const abstractProperty = 'http://hl7.org/fhir/concept-properties#notSelectable';

export type TerminologyResource = CodeSystem | ValueSet | ConceptMap;

export async function findTerminologyResource<T extends TerminologyResource>(
  resourceType: T['resourceType'],
  url: string
): Promise<T> {
  const { repo } = getAuthenticatedContext();
  const resources = await repo.searchResources<T>({
    resourceType,
    filters: [{ code: 'url', operator: Operator.EQUALS, value: url }],
    sortRules: [
      // Select highest version (by lexical sort -- no version is assumed to be "current")
      { code: 'version', descending: true },
      // Break ties by selecting more recently-updated resource (lexically -- no date is assumed to be current)
      { code: 'date', descending: true },
    ],
  });

  if (!resources.length) {
    throw new OperationOutcomeError(badRequest(`${resourceType} ${url} not found`));
  } else if (resources.length === 1) {
    return resources[0];
  } else {
    resources.sort((a: TerminologyResource, b: TerminologyResource) => {
      // Select the non-base FHIR versions of resources before the base FHIR ones
      // This is kind of a kludge, but is required to break ties because some CodeSystems (including SNOMED)
      // don't have a version and the base spec version doesn't include a date (and so is always considered current)
      if (a.meta?.project === r4ProjectId) {
        return 1;
      } else if (b.meta?.project === r4ProjectId) {
        return -1;
      }
      return 0;
    });
    return resources[0];
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

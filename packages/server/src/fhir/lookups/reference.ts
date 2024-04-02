import { PropertyType, evalFhirPathTyped, getSearchParameters, isUUID, toTypedValue } from '@medplum/core';
import { Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { PoolClient } from 'pg';
import { LookupTable } from './lookuptable';

/**
 * The ReferenceTable class represents a set of lookup tables for references between resources.
 * Each reference is represented as a separate row in the "<ResourceType>_References" table.
 */
export class ReferenceTable extends LookupTable {
  getTableName(resourceType: ResourceType): string {
    return resourceType + '_References';
  }

  getColumnName(): string {
    throw new Error('ReferenceTable.getColumnName not implemented');
  }

  /**
   * Returns false, because the table is never used for normal SearchParameter search.
   * Instead, it is only used for JOINs between tables.
   * @returns False
   */
  isIndexed(): boolean {
    return false;
  }

  async indexResource(client: PoolClient, resource: Resource, create: boolean): Promise<void> {
    if (!create) {
      await this.deleteValuesForResource(client, resource);
    }

    const values = getSearchReferences(resource);
    await this.insertValuesForResource(client, resource.resourceType, values);
  }
}

interface ReferenceRow {
  resourceId: string;
  targetId: string;
  code: string;
}

/**
 * Returns a list of all references in the resource to be inserted into the database.
 * This includes all values for any SearchParameter of `reference` type
 * @param resource - The resource being indexed.
 * @returns An array of all references from the resource to be inserted into the database.
 */
function getSearchReferences(resource: Resource): ReferenceRow[] {
  const typedResource = [toTypedValue(resource)];
  const searchParams = getSearchParameters(resource.resourceType);
  if (!searchParams) {
    return [];
  }
  const result = new Map<string, ReferenceRow>();
  for (const searchParam of Object.values(searchParams)) {
    if (!isIndexed(searchParam)) {
      continue;
    }

    const typedValues = evalFhirPathTyped(searchParam.expression as string, typedResource);
    for (const value of typedValues) {
      if (value.type !== PropertyType.Reference || !value.value.reference) {
        continue;
      }
      const [_targetType, targetId] = value.value.reference.split('/', 2);
      if (isUUID(targetId)) {
        result.set(`${searchParam.code}|${targetId}`, {
          resourceId: resource.id as string,
          targetId: targetId,
          code: searchParam.code as string,
        });
      }
    }
  }
  return Array.from(result.values());
}

/**
 * Returns true if the search parameter is a "reference" parameter.
 * @param searchParam - The search parameter.
 * @returns True if the search parameter is an "reference" parameter.
 */
function isIndexed(searchParam: SearchParameter): boolean {
  return (
    searchParam.type === 'reference' &&
    searchParam.code !== '_compartment' && // Compartment search is a special internal case that is on the resource table
    !searchParam.code.endsWith(':identifier') // Identifier search is a special internal case that is on the token table
  );
}

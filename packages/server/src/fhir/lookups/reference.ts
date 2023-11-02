import { Reference, Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { PoolClient } from 'pg';
import { LookupTable } from './lookuptable';
import { PropertyType, evalFhirPathTyped, getSearchParameters, isUUID, toTypedValue } from '@medplum/core';
import { SelectQuery } from '../sql';
import { compareArrays } from './util';

/**
 * The ReferenceTable class represents a set of lookup tables for references between resources.
 * Each reference is represented as a separate row in the "<ResourceType>_References" table.
 */
export class ReferenceTable extends LookupTable<Reference> {
  getTableName(resourceType: ResourceType): string {
    return resourceType + '_References';
  }

  getColumnName(): string {
    return '';
  }

  /**
   * Returns false, because the table is never used for normal SearchParameter search.
   * Instead, it is only used for JOINs between tables.
   * @returns False
   */
  isIndexed(): boolean {
    return false;
  }

  async indexResource(client: PoolClient, resource: Resource): Promise<void> {
    const values = getSearchReferences(resource);
    const existing = await getExistingValues(client, this.getTableName(resource.resourceType), resource.id as string);
    if (compareArrays(values, existing)) {
      // Nothing changed
      return;
    }
    if (existing.length > 0) {
      await this.deleteValuesForResource(client, resource);
    }
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
  const result: ReferenceRow[] = [];
  if (searchParams) {
    for (const searchParam of Object.values(searchParams)) {
      if (isIndexed(searchParam)) {
        const typedValues = evalFhirPathTyped(searchParam.expression as string, typedResource);
        for (const value of typedValues) {
          if (value.type === PropertyType.Reference) {
            const reference = value.value;
            if (!reference.reference) {
              continue;
            }
            const [_targetType, targetId] = reference.reference.split('/', 2);
            if (!isUUID(targetId)) {
              continue;
            }
            result.push({
              resourceId: resource.id as string,
              targetId: targetId,
              code: searchParam.code as string,
            });
          }
        }
      }
    }
  }
  return result;
}

/**
 * Returns true if the search parameter is a "reference" parameter.
 * @param searchParam - The search parameter.
 * @returns True if the search parameter is an "reference" parameter.
 */
function isIndexed(searchParam: SearchParameter): boolean {
  if (searchParam.type !== 'reference') {
    return false;
  } else if (searchParam.code?.endsWith(':identifier')) {
    return false;
  }
  return true;
}

/**
 * Returns the existing list of indexed references.
 * @param client - The current database client.
 * @param tableName - The table to query.
 * @param resourceId - The FHIR resource ID.
 * @returns Promise for the list of indexed references.
 */
async function getExistingValues(client: PoolClient, tableName: string, resourceId: string): Promise<ReferenceRow[]> {
  return new SelectQuery(tableName)
    .where('resourceId', '=', resourceId)
    .execute(client)
    .then((result) =>
      result.map((row) => ({
        code: row.code,
        resourceId: row.resourceId,
        targetId: row.targetId,
      }))
    );
}

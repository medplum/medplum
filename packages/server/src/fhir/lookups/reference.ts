import {
  PropertyType,
  WithId,
  evalFhirPathTyped,
  getSearchParameterDetails,
  getSearchParameters,
  isResource,
  isUUID,
  resolveId,
  toTypedValue,
} from '@medplum/core';
import { Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { Pool, PoolClient } from 'pg';
import { InsertQuery } from '../sql';
import { LookupTable, LookupTableRow } from './lookuptable';

export interface ReferenceTableRow extends LookupTableRow {
  resourceId: string;
  targetId: string;
  code: string;
}

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

  extractValues(result: ReferenceTableRow[], resource: WithId<Resource>): void {
    getSearchReferences(result, resource);
  }

  /**
   * Inserts reference values into the lookup table for a resource.
   * @param client - The database client.
   * @param resourceType - The resource type.
   * @param values - The values to insert.
   */
  async insertValuesForResource(
    client: Pool | PoolClient,
    resourceType: ResourceType,
    values: Record<string, any>[]
  ): Promise<void> {
    if (values.length === 0) {
      return;
    }
    const tableName = this.getTableName(resourceType);

    // Reference lookup tables have a covering primary key, so a conflict means
    // that the exact desired row already exists in the database
    for (let i = 0; i < values.length; i += 10_000) {
      const batchedValues = values.slice(i, i + 10_000);
      const insert = new InsertQuery(tableName, batchedValues).ignoreOnConflict();
      await insert.execute(client);
    }
  }
}

/**
 * Returns a list of all references in the resource to be inserted into the database.
 * This includes all values for any SearchParameter of `reference` type
 * @param result - The array to which the references will be added.
 * @param resource - The resource being indexed.
 */
function getSearchReferences(result: ReferenceTableRow[], resource: WithId<Resource>): void {
  const searchParams = getSearchParameters(resource.resourceType);
  if (!searchParams) {
    return;
  }
  const resultMap = new Map<string, ReferenceTableRow>();
  for (const searchParam of Object.values(searchParams)) {
    if (!isIndexed(searchParam)) {
      continue;
    }

    const details = getSearchParameterDetails(resource.resourceType, searchParam);
    const typedValues = evalFhirPathTyped(details.parsedExpression, [toTypedValue(resource)]);
    for (const value of typedValues) {
      if (value.type === PropertyType.Reference && value.value.reference) {
        const targetId = resolveId(value.value);
        if (targetId && isUUID(targetId)) {
          addSearchReferenceResult(resultMap, resource, searchParam, targetId);
        }
      }

      if (isResource(value.value) && value.value.id && isUUID(value.value.id)) {
        addSearchReferenceResult(resultMap, resource, searchParam, value.value.id);
      }
    }
  }
  result.push(...resultMap.values());
}

/**
 * Adds a search reference result to the result map.
 * @param result - The result map to add the reference to.
 * @param resource - The resource being indexed.
 * @param searchParam - The search parameter.
 * @param targetId - The target ID.
 */
function addSearchReferenceResult(
  result: Map<string, ReferenceTableRow>,
  resource: WithId<Resource>,
  searchParam: SearchParameter,
  targetId: string
): void {
  result.set(`${searchParam.code}|${targetId}`, {
    resourceId: resource.id,
    targetId: targetId,
    code: searchParam.code as string,
  });
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

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  PropertyType,
  evalFhirPathTyped,
  getSearchParameterDetails,
  getSearchParameters,
  isResource,
  isUUID,
  resolveId,
  toTypedValue,
} from '@medplum/core';
import type { Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import type { Pool, PoolClient } from 'pg';
import { getLogger } from '../../logger';
import { InsertQuery, SelectQuery } from '../sql';
import type { LookupTableRow } from './lookuptable';
import { LookupTable } from './lookuptable';

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
  private allColumnNames: string[] = ['resourceId', 'targetId', 'code'];

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

  /**
   * Indexes the resource in the lookup table.
   * @param client - The database client.
   * @param resources - The resources to index.
   * @param create - True if the resource should be created (vs updated).
   */
  async batchIndexResources<T extends Resource>(
    client: PoolClient,
    resources: WithId<T>[],
    create: boolean
  ): Promise<void> {
    if (resources.length === 0) {
      return;
    }

    const resourceType = resources[0].resourceType;

    let existingRows: LookupTableRow[];
    if (create) {
      existingRows = [];
    } else {
      existingRows = await this.batchGetExistingValues(client, resources);
    }

    // Batch at the resource level to avoid tying up the event loop for too long
    // with synchronous work without any async breaks between DB calls.
    const resourceBatchSize = 200;
    const newRows: ReferenceTableRow[] = [];
    for (let i = 0; i < resources.length; i += resourceBatchSize) {
      for (let j = i; j < i + resourceBatchSize && j < resources.length; j++) {
        const resource = resources[j];
        if (resource.resourceType !== resourceType) {
          throw new Error(
            `batchIndexResources must be called with resources of the same type: ${resource.resourceType} vs ${resourceType}`
          );
        }
        try {
          this.extractValues(newRows, resource);
        } catch (err) {
          getLogger().error('Error extracting values for resource', {
            resource: `${resourceType}/${resource.id}`,
            err,
          });
          throw err;
        }
      }
    }

    // Identify diff between existing rows and new rows
    const resourcesToDelete: Resource[] = [];
    const rowsToInsert: LookupTableRow[] = [];
    for (const resource of resources) {
      const existingForResource = existingRows.filter((r) => r.resourceId === resource.id);
      const newForResource = newRows.filter((r) => r.resourceId === resource.id);

      // Check if the sets are identical (ignoring order)
      let areIdentical = existingForResource.length === newForResource.length;
      if (areIdentical) {
        // Sort and compare stringified rows with sorted keys
        const sortedExisting = existingForResource.map((r) => JSON.stringify(r, Object.keys(r).sort())).sort();
        const sortedNew = newForResource.map((r) => JSON.stringify(r, Object.keys(r).sort())).sort();
        areIdentical = sortedExisting.every((val, idx) => val === sortedNew[idx]);
      }

      if (!areIdentical) {
        console.log('Changes detected for resource', `${resourceType}/${resource.id}`);
        console.log('Existing rows:\n', JSON.stringify(existingForResource, null, 2));
        console.log('New rows:\n', JSON.stringify(newForResource, null, 2));
        resourcesToDelete.push(resource);
        rowsToInsert.push(...newForResource);
      }
    }

    // getLogger().info('Batch indexing resources', {
    //   resourceType,
    //   unchangedResources: resources.length - resourcesToDelete.length,
    //   resourcesToDelete: resourcesToDelete.length,
    //   rowsToInsert: rowsToInsert.length,
    // });

    if (resourcesToDelete.length > 0) {
      await this.batchDeleteValuesForResources(client, resourcesToDelete);
    }

    if (rowsToInsert.length > 0) {
      await this.insertValuesForResource(client, resourceType, rowsToInsert);
    }
  }

  extractValues(result: ReferenceTableRow[], resource: WithId<Resource>): void {
    getSearchReferences(result, resource);
  }

  async batchGetExistingValues<T extends Resource>(
    client: Pool | PoolClient,
    resources: T[]
  ): Promise<LookupTableRow[]> {
    if (resources.length === 0) {
      return [];
    }

    const tableName = this.getTableName(resources[0].resourceType);
    const resourceIds = resources.map((r) => r.id);

    const selectQuery = new SelectQuery(tableName).where('resourceId', 'IN', resourceIds);
    for (const columnName of this.allColumnNames) {
      selectQuery.column(columnName);
    }
    // console.log('Executing select query for existing rows:');
    const rows = await selectQuery.execute(client);
    // console.log('Existing rows fetched:', rows.length);
    // console.log(JSON.stringify(rows, null, 2));
    return rows as LookupTableRow[];
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

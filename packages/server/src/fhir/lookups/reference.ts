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

    const existingRows = create ? undefined : await this.getExistingRows(client, resources);
    if (existingRows === undefined || existingRows.length === 0) {
      const newRows: ReferenceTableRow[] = [];
      await this.extractAllValues(newRows, resources);

      // nothing to delete since no existing rows

      if (newRows.length > 0) {
        await this.batchInsertRows(client, resourceType, newRows);
      }
      return;
    }

    const existingHashesByResource = new Map<string, Set<string>>();
    for (const row of existingRows) {
      let hashes = existingHashesByResource.get(row.resourceId);
      if (!hashes) {
        hashes = new Set<string>();
        existingHashesByResource.set(row.resourceId, hashes);
      }
      hashes.add(hashRow(row));
    }

    const newRowsByResource = new Map<string, ReferenceTableRow[]>();
    await this.extractAllValues(newRowsByResource, resources);

    const resourcesToDelete: Resource[] = [];
    const rowsToInsert: LookupTableRow[] = [];
    for (const resource of resources) {
      const existingHashes = existingHashesByResource.get(resource.id) ?? new Set<string>();
      const newRowsForResource = newRowsByResource.get(resource.id) ?? [];
      const newHashes = new Set(newRowsForResource.map(hashRow));

      const identical = existingHashes.size === newHashes.size && [...existingHashes].every((h) => newHashes.has(h));
      if (!identical) {
        resourcesToDelete.push(resource);
        rowsToInsert.push(...newRowsForResource);
      }
    }

    if (resourcesToDelete.length > 0) {
      getLogger().info('Reference changes detected', {
        resourceType,
        unchangedCount: resources.length - resourcesToDelete.length,
        changedCount: resourcesToDelete.length,
        rowsToInsert: rowsToInsert.length,
        sampleIds: resourcesToDelete.slice(0, 5),
      });
    }

    if (resourcesToDelete.length > 0) {
      await this.batchDeleteValuesForResources(client, resourcesToDelete);
    }

    if (rowsToInsert.length > 0) {
      await this.batchInsertRows(client, resourceType, rowsToInsert);
    }
  }

  /**
   * Extracts values from all resources with batching to avoid blocking the event loop.
   * @param result - The array to populate with extracted values.
   * @param resources - The resources to extract values from.
   */
  private async extractAllValues<T extends Resource>(
    result: ReferenceTableRow[] | Map<string, ReferenceTableRow[]>,
    resources: WithId<T>[]
  ): Promise<void> {
    if (resources.length === 0) {
      return;
    }

    const resourceType = resources[0].resourceType;

    // Batch at the resource level to avoid tying up the event loop for too long
    // with synchronous work without any async breaks between DB calls.
    const resourceBatchSize = 200;
    for (let i = 0; i < resources.length; i += resourceBatchSize) {
      for (let j = i; j < i + resourceBatchSize && j < resources.length; j++) {
        const resource = resources[j];
        if (resource.resourceType !== resourceType) {
          throw new Error(
            `batchIndexResources must be called with resources of the same type: ${resource.resourceType} vs ${resourceType}`
          );
        }
        try {
          if (result instanceof Map) {
            let rowArray = result.get(resource.id);
            if (!rowArray) {
              rowArray = [];
              result.set(resource.id, rowArray);
            }
            this.extractValues(rowArray, resource);
          } else {
            this.extractValues(result, resource);
          }
        } catch (err) {
          getLogger().error('Error extracting values for resource', {
            resource: `${resourceType}/${resource.id}`,
            err,
          });
          throw err;
        }
      }
    }
  }

  extractValues(result: ReferenceTableRow[], resource: WithId<Resource>): void {
    getSearchReferences(result, resource);
  }

  async getExistingRows<T extends Resource>(client: Pool | PoolClient, resources: T[]): Promise<ReferenceTableRow[]> {
    if (resources.length === 0) {
      return [];
    }
    const selectQuery = new SelectQuery(this.getTableName(resources[0].resourceType)).where(
      'resourceId',
      'IN',
      resources.map((r) => r.id)
    );
    for (const columnName of this.allColumnNames) {
      selectQuery.column(columnName);
    }
    return selectQuery.execute<ReferenceTableRow>(client);
  }

  /**
   * Inserts reference values into the lookup table for a resource.
   * @param client - The database client.
   * @param resourceType - The resource type.
   * @param values - The values to insert.
   */
  async batchInsertRows(
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
 * Creates a hash string for a reference row for efficient comparison.
 * @param row - The reference table row.
 * @returns A hash string combining resourceId, targetId, and code.
 */
function hashRow(row: ReferenceTableRow): string {
  return `${row.resourceId}|${row.targetId}|${row.code}`;
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

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
  projectAdminResourceTypes,
  resolveId,
  toTypedValue,
} from '@medplum/core';
import type { Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import { getLogger } from '../../logger';
import type { Expression, PgQueryable, SqlBuilder } from '../sql';
import { DeleteQuery, InsertQuery, SelectQuery } from '../sql';
import type { LookupTableRow } from './lookuptable';
import { LookupTable } from './lookuptable';

export interface ReferenceTableRow extends LookupTableRow {
  readonly resourceId: string;
  readonly targetId: string;
  readonly code: string;
}

/**
 * Returns true if chained search is disabled for the resource type by server config,
 * in which case its references are not written to the `<ResourceType>_References` table.
 * @param resourceType - The resource type.
 * @returns True if chained search is disabled for the resource type.
 */
export function isChainedSearchDisabled(resourceType: string): boolean {
  return Boolean(
    getConfig().disableChainedSearch?.includes(resourceType) && !projectAdminResourceTypes.includes(resourceType)
  );
}

/**
 * The ReferenceTable class represents a set of lookup tables for references between resources.
 * Each reference is represented as a separate row in the "<ResourceType>_References" table.
 */
export class ReferenceTable extends LookupTable {
  static readonly allColumnNames = ['resourceId', 'targetId', 'code'] as const;

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

  async batchIndexResources<T extends Resource>(
    client: PgQueryable,
    resources: WithId<T>[],
    create: boolean,
    resourceBatchSize: number = 200
  ): Promise<void> {
    if (resources.length === 0) {
      return;
    }

    const resourceType = resources[0].resourceType;
    if (isChainedSearchDisabled(resourceType)) {
      return;
    }

    const existingRows = create ? [] : await this.getExistingRows(client, resources);
    const staleRows = new Map<string, ReferenceTableRow>();
    for (const row of existingRows) {
      staleRows.set(hashRow(row), row);
    }

    const newRows: ReferenceTableRow[] = [];
    await this.extractAllValues(newRows, resources, resourceBatchSize);

    // Rows that already exist are left untouched; whatever remains in staleRows afterward is deleted
    const rowsToInsert = staleRows.size > 0 ? newRows.filter((row) => !staleRows.delete(hashRow(row))) : newRows;
    const rowsToDelete = [...staleRows.values()];

    if (existingRows.length > 0 && (rowsToDelete.length > 0 || rowsToInsert.length > 0)) {
      const changedIds = new Set<string>();
      for (const row of rowsToDelete) {
        changedIds.add(row.resourceId);
      }
      for (const row of rowsToInsert) {
        changedIds.add(row.resourceId);
      }
      getLogger().info('Reference changes detected', {
        resourceType,
        unchangedCount: resources.length - changedIds.size,
        changedCount: changedIds.size,
        rowsToDelete: rowsToDelete.length,
        rowsToInsert: rowsToInsert.length,
        sampleIds: changedIds.values().take(5).toArray(),
      });
    }

    if (rowsToDelete.length > 0) {
      await this.batchDeleteRows(client, resourceType, rowsToDelete);
    }

    if (rowsToInsert.length > 0) {
      await this.batchInsertRows(client, resourceType, rowsToInsert);
    }
  }

  /**
   * Extracts values from all resources with batching to avoid blocking the event loop.
   * @param result - The array to populate with extracted values.
   * @param resources - The resources to extract values from.
   * @param resourceBatchSize - (optional) The resource batch size to yield to the event loop between. Default is 200.
   */
  private async extractAllValues<T extends Resource>(
    result: ReferenceTableRow[],
    resources: WithId<T>[],
    resourceBatchSize: number
  ): Promise<void> {
    const resourceType = resources[0].resourceType;

    // Batch at the resource level to avoid tying up the event loop for too long
    // with synchronous work without any async breaks between DB calls.
    for (let i = 0; i < resources.length; i += resourceBatchSize) {
      for (let j = i; j < i + resourceBatchSize && j < resources.length; j++) {
        const resource = resources[j];
        if (resource.resourceType !== resourceType) {
          throw new Error(
            `batchIndexResources must be called with resources of the same type: ${resource.resourceType} vs ${resourceType}`
          );
        }
        try {
          this.extractValues(result, resource);
        } catch (err) {
          getLogger().error('Error extracting values for resource', {
            resource: `${resourceType}/${resource.id}`,
            err,
          });
          throw err;
        }
      }

      // Yield to event loop between batches
      if (i + resourceBatchSize < resources.length) {
        await new Promise((resolve) => {
          setImmediate(resolve);
        });
      }
    }
  }

  extractValues(result: ReferenceTableRow[], resource: WithId<Resource>): void {
    getSearchReferences(result, resource);
  }

  async getExistingRows<T extends Resource>(client: PgQueryable, resources: T[]): Promise<ReferenceTableRow[]> {
    if (resources.length === 0) {
      return [];
    }
    const selectQuery = new SelectQuery(this.getTableName(resources[0].resourceType)).where(
      'resourceId',
      'IN',
      resources.map((r) => r.id)
    );
    for (const columnName of ReferenceTable.allColumnNames) {
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
  async batchInsertRows(client: PgQueryable, resourceType: ResourceType, values: Record<string, any>[]): Promise<void> {
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

  private async batchDeleteRows(
    client: PgQueryable,
    resourceType: ResourceType,
    rows: ReferenceTableRow[]
  ): Promise<void> {
    const tableName = this.getTableName(resourceType);
    for (let i = 0; i < rows.length; i += 10_000) {
      const batchedRows = rows.slice(i, i + 10_000);
      await new DeleteQuery(tableName).whereExpr(new RowsInArrays(batchedRows)).execute(client);
    }
  }
}

/**
 * Matches rows whose full key is in the given set, passing one array parameter per column.
 * Unlike an OR of per-row equality checks, this plans as a nested loop of primary key lookups
 * at constant planning cost regardless of row count.
 */
class RowsInArrays implements Expression {
  private static readonly columnTypes = { resourceId: 'uuid', targetId: 'uuid', code: 'text' } as const;
  private readonly rows: ReferenceTableRow[];

  constructor(rows: ReferenceTableRow[]) {
    this.rows = rows;
  }

  buildSql(sql: SqlBuilder): void {
    const columns = ReferenceTable.allColumnNames;
    sql.append('(');
    columns.forEach((c, i) => {
      sql.append(i === 0 ? '' : ', ').appendIdentifier(c);
    });
    sql.append(') IN (SELECT * FROM unnest(');
    columns.forEach((c, i) => {
      sql.append(i === 0 ? '' : ', ');
      sql.param(this.rows.map((row) => row[c]));
      sql.append(`::${RowsInArrays.columnTypes[c]}[]`);
    });
    sql.append('))');
  }
}

/**
 * Creates a hash string for a reference row for efficient comparison.
 * UUIDs are lowercased to match how Postgres returns them, so a casing-only change is not a diff.
 * @param row - The reference table row.
 * @returns A hash string combining resourceId, targetId, and code.
 */
function hashRow(row: ReferenceTableRow): string {
  return `${row.resourceId.toLowerCase()}|${row.targetId.toLowerCase()}|${row.code}`;
}

/**
 * Returns a list of all references in the resource to be inserted into the database.
 * This includes all values for any SearchParameter of `reference` type
 * @param result - The array to which the references will be added.
 * @param resource - The resource being indexed.
 */
function getSearchReferences(result: ReferenceTableRow[], resource: WithId<Resource>): void {
  const searchParams = getSearchParameters(resource.resourceType);
  if (searchParams) {
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
  result.set(`${searchParam.code}|${targetId.toLowerCase()}`, {
    resourceId: resource.id,
    targetId: targetId,
    code: searchParam.code,
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

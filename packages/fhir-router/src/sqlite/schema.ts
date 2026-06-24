// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ResourceType } from '@medplum/fhirtypes';
import type { DatabaseSync } from 'node:sqlite';
import { getSearchParameterImplementation, SearchStrategies } from '../indexing/searchparameter.js';
import { getStandardAndDerivedSearchParameters } from '../indexing/lookups/util.js';
const BASE_COLUMNS = ['id', 'content', 'lastUpdated', 'deleted', 'projectId', '__version'] as const;

const LOOKUP_TABLES: Record<string, string[]> = {
  HumanName: ['resourceId', 'name', 'given', 'family'],
  Address: ['resourceId', 'address', 'city', 'country', 'postalCode', 'state', 'use'],
  ContactPoint: ['resourceId', 'system', 'value'],
  Identifier: ['resourceId', 'system', 'value'],
};

export class SqliteSchema {
  private readonly createdTables = new Set<string>();
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "ResourceHistory" (
        "resourceType" TEXT NOT NULL,
        "id" TEXT NOT NULL,
        "versionId" TEXT NOT NULL,
        "lastUpdated" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        PRIMARY KEY ("resourceType", "id", "versionId")
      );
    `);

    for (const [tableName, columns] of Object.entries(LOOKUP_TABLES)) {
      this.createTable(tableName, columns);
    }
  }

  ensureResourceTable(resourceType: ResourceType): void {
    if (this.createdTables.has(resourceType)) {
      return;
    }

    const columns = new Set<string>(BASE_COLUMNS);
    if (resourceType !== 'Binary') {
      columns.add('compartments');
    }

    for (const searchParam of getStandardAndDerivedSearchParameters(resourceType)) {
      for (const column of getSearchColumns(searchParam, resourceType)) {
        columns.add(column);
      }
    }

    this.createTable(resourceType, Array.from(columns));
    this.createdTables.add(resourceType);
  }

  ensureReferenceTable(resourceType: ResourceType): void {
    const tableName = `${resourceType}_References`;
    if (this.createdTables.has(tableName)) {
      return;
    }
    this.createTable(tableName, ['resourceId', 'targetId', 'code']);
  }

  private createTable(tableName: string, columns: string[]): void {
    if (this.createdTables.has(tableName)) {
      return;
    }

    const columnDefs = columns.map((col) => {
      if (col === 'deleted') {
        return '"deleted" INTEGER NOT NULL DEFAULT 0';
      }
      if (col === '__version') {
        return '"__version" INTEGER NOT NULL DEFAULT 1';
      }
      if (col === 'id') {
        return '"id" TEXT PRIMARY KEY';
      }
      return `"${col}" TEXT`;
    });

    this.db.exec(`CREATE TABLE IF NOT EXISTS "${tableName}" (${columnDefs.join(', ')});`);
    this.createdTables.add(tableName);
  }
}

function getSearchColumns(searchParam: { code: string; type: string }, resourceType: string): string[] {
  if (
    searchParam.code === '_id' ||
    searchParam.code === '_lastUpdated' ||
    searchParam.code === '_compartment:identifier' ||
    searchParam.code === '_deleted' ||
    searchParam.code === '_project' ||
    searchParam.type === 'composite'
  ) {
    return [];
  }

  if (searchParam.code === '_compartment') {
    return ['compartments'];
  }

  const impl = getSearchParameterImplementation(resourceType, searchParam as any);
  switch (impl.searchStrategy) {
    case SearchStrategies.COLUMN:
      return [impl.columnName];
    case SearchStrategies.LOOKUP_TABLE:
      return impl.sortColumnName ? [impl.sortColumnName] : [];
    case SearchStrategies.TOKEN_COLUMN:
      return [impl.tokenColumnName, impl.textSearchColumnName, impl.sortColumnName];
    case SearchStrategies.RANGE_COLUMN:
      return [impl.rangeColumnName, impl.sortColumnName, impl.columnName];
    default:
      return [];
  }
}

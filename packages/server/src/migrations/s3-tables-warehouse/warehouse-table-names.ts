// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { getResourceTypes } from '@medplum/core';

/** Default Iceberg catalog namespace when `dataWarehouse.namespace` is unset (matches warehouse sync). */
export const DEFAULT_WAREHOUSE_NAMESPACE = 'default';

export interface WarehouseSourceTable {
  readonly postgresTable: string;
  readonly icebergTable: string;
  readonly tableKey: string;
}

/**
 * Postgres history table names for all indexed repository resource types (`{ResourceType}_History`).
 *
 * @returns Non-empty list of Postgres `_History` table identifiers.
 */
export function getWarehouseSyncPostgresTableNames(): string[] {
  return getResourceTypes().map((resourceType) => `${resourceType}_History`);
}

export function toIcebergTableName(tableIdentifier: string): string {
  return tableIdentifier.toLowerCase();
}

export function resolveWarehouseSourcesFromPostgresTableNames(tableNames: string[]): WarehouseSourceTable[] {
  const resolved: WarehouseSourceTable[] = [];
  for (const raw of tableNames) {
    const postgresTable = raw.trim();
    if (!postgresTable) {
      continue;
    }
    const icebergTable = toIcebergTableName(postgresTable);
    resolved.push({ postgresTable, icebergTable, tableKey: icebergTable });
  }

  if (resolved.length === 0) {
    throw new Error('At least one Postgres table name is required when using --table');
  }

  return [...new Map(resolved.map((s) => [s.postgresTable, s])).values()];
}

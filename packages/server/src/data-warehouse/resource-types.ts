// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Parse a comma-separated CLI list of Postgres table names (trimmed, empty entries dropped).
 * @param value - Raw comma-separated string from CLI or env, or undefined.
 * @returns Non-empty array of table names, or undefined if input is missing or yields no names.
 */
export function parseCommaSeparatedTableNames(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : undefined;
}

export type WarehousePartitionTransform = 'identity' | 'day';

export interface WarehousePartitionField {
  sourceColumn: 'project_id' | 'last_updated';
  transform: WarehousePartitionTransform;
  name: string;
}

/**
 * Shared Iceberg partition definition for all warehouse tables.
 * Partitions by project identity and last_updated day.
 */
export const WAREHOUSE_ICEBERG_PARTITION_FIELDS = [
  { sourceColumn: 'project_id', transform: 'identity', name: 'project_id' },
  { sourceColumn: 'last_updated', transform: 'day', name: 'last_updated_day' },
] as const satisfies readonly WarehousePartitionField[];

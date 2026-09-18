// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { IcebergMetadata } from '@aws-sdk/client-s3tables';

/**
 * Stable Iceberg field IDs for the warehouse `_History` layout.
 * Partition fields reference these IDs; names align with DuckDB `INSERT` from the data warehouse sync.
 */
export const WAREHOUSE_ICEBERG_FIELD_IDS = {
  id: 1,
  version_id: 2,
  content: 3,
  last_updated: 4,
  project_id: 5,
} as const;

/**
 * Iceberg metadata (schema + partition spec) for managed S3 Tables backing Medplum `_History` sync.
 *
 * @returns Iceberg metadata accepted by `CreateTableCommand` for format `ICEBERG`.
 */
export function buildMedplumWarehouseHistoryIcebergMetadata(): IcebergMetadata {
  const ids = WAREHOUSE_ICEBERG_FIELD_IDS;
  return {
    schema: {
      fields: [
        { id: ids.id, name: 'id', type: 'string', required: true },
        { id: ids.version_id, name: 'version_id', type: 'string', required: true },
        { id: ids.content, name: 'content', type: 'string', required: false },
        { id: ids.last_updated, name: 'last_updated', type: 'timestamptz', required: true },
        { id: ids.project_id, name: 'project_id', type: 'string', required: false },
      ],
    },
    partitionSpec: {
      specId: 0,
      fields: [
        { sourceId: ids.project_id, transform: 'identity', name: 'project_id' },
        { sourceId: ids.last_updated, transform: 'day', name: 'last_updated_day' },
      ],
    },
  };
}

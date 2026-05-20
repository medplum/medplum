// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { buildMedplumWarehouseHistoryIcebergMetadata, WAREHOUSE_ICEBERG_FIELD_IDS } from './warehouse-iceberg-metadata';

describe('warehouse-iceberg-metadata', () => {
  test('buildMedplumWarehouseHistoryIcebergMetadata matches sync column layout', () => {
    const meta = buildMedplumWarehouseHistoryIcebergMetadata();
    const fields = meta.schema?.fields ?? [];
    expect(fields.map((f) => f?.name)).toEqual(['id', 'version_id', 'content', 'last_updated', 'project_id']);
    expect(fields.map((f) => f?.id)).toEqual([
      WAREHOUSE_ICEBERG_FIELD_IDS.id,
      WAREHOUSE_ICEBERG_FIELD_IDS.version_id,
      WAREHOUSE_ICEBERG_FIELD_IDS.content,
      WAREHOUSE_ICEBERG_FIELD_IDS.last_updated,
      WAREHOUSE_ICEBERG_FIELD_IDS.project_id,
    ]);
    const parts = meta.partitionSpec?.fields ?? [];
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({
      sourceId: WAREHOUSE_ICEBERG_FIELD_IDS.project_id,
      transform: 'identity',
      name: 'project_id',
    });
    expect(parts[1]).toMatchObject({
      sourceId: WAREHOUSE_ICEBERG_FIELD_IDS.last_updated,
      transform: 'day',
      name: 'last_updated_day',
    });
  });
});

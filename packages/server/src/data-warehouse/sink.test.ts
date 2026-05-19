// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqlBuilder } from '../fhir/sql';
import { LocalParquetWarehouseSink } from './sink';

describe('data warehouse sinks', () => {
  test('local sink returns parquet file result path', async () => {
    const basePath = mkdtempSync(join(tmpdir(), 'dw-local-sink-'));
    try {
      const sink = new LocalParquetWarehouseSink(basePath);
      const table = sink.getDestinationName({
        postgresTable: 'Patient_history',
        icebergTable: 'patient_history',
      });
      expect(table).toContain('patient_history.parquet');
      const sourcePredicateSql = new SqlBuilder();
      sourcePredicateSql.appendExpression(
        sink.buildSourcePredicate({ postgresTable: 'a', icebergTable: 'a' }, 'default')
      );
      expect(sourcePredicateSql.toString()).toBe('TRUE');
    } finally {
      rmSync(basePath, { recursive: true, force: true });
    }
  });
});

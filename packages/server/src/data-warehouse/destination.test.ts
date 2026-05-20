// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqlBuilder } from '../fhir/sql';
import { LocalParquetWarehouseDestination } from './destination';

describe('data warehouse destinations', () => {
  test('local destination returns parquet file result path', async () => {
    const basePath = mkdtempSync(join(tmpdir(), 'dw-local-destination-'));
    try {
      const destination = new LocalParquetWarehouseDestination(basePath);
      const table = destination.getDestinationName({
        postgresTable: 'Patient_history',
        icebergTable: 'patient_history',
      });
      expect(table).toContain('patient_history.parquet');
      const sourcePredicateSql = new SqlBuilder();
      sourcePredicateSql.appendExpression(
        destination.buildSourcePredicate({ postgresTable: 'a', icebergTable: 'a' }, 'default')
      );
      expect(sourcePredicateSql.toString()).toBe('TRUE');
    } finally {
      rmSync(basePath, { recursive: true, force: true });
    }
  });
});

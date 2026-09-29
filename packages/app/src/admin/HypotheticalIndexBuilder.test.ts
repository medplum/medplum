// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { buildHypotheticalIndexSql, createHypotheticalIndexDraft } from './hypotheticalIndexSql';

describe('buildHypotheticalIndexSql', () => {
  test('omits a blank builder', () => {
    expect(buildHypotheticalIndexSql([createHypotheticalIndexDraft()])).toEqual({});
  });

  test('builds btree and unique hash indexes', () => {
    const result = buildHypotheticalIndexSql([
      {
        id: '1',
        tableName: 'Appointment',
        columns: ['projectId', 'status'],
        accessMethod: 'btree',
        unique: false,
      },
      {
        id: '2',
        tableName: 'Patient',
        columns: ['id'],
        accessMethod: 'hash',
        unique: true,
      },
    ]);

    expect(result).toEqual({
      sql: 'CREATE INDEX ON "Appointment" USING btree ("projectId", "status"); CREATE UNIQUE INDEX ON "Patient" USING hash ("id")',
    });
  });

  test('does not emit UNIQUE for bloom', () => {
    const result = buildHypotheticalIndexSql([
      {
        id: '1',
        tableName: 'Patient',
        columns: ['active'],
        accessMethod: 'bloom',
        unique: true,
      },
    ]);

    expect(result.sql).toBe('CREATE INDEX ON "Patient" USING bloom ("active")');
  });

  test('rejects a started index that is missing columns', () => {
    const result = buildHypotheticalIndexSql([
      {
        id: '1',
        tableName: 'Appointment',
        columns: [],
        accessMethod: 'btree',
        unique: false,
      },
    ]);

    expect(result.error).toBe('Each hypothetical index needs a table and at least one column');
    expect(result.sql).toBeUndefined();
  });
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError } from '@medplum/core';
import type { Repository } from '../repo';
import { isUndefinedFunctionError, parseHypotheticalIndexStatements, withHypotheticalIndexes } from './explain';

describe('parseHypotheticalIndexStatements', () => {
  test('Parses multiple CREATE INDEX statements', () => {
    expect(
      parseHypotheticalIndexStatements(
        'CREATE INDEX ON "Appointment" ("projectId", "status"); CREATE UNIQUE INDEX ON "Patient" ("id")'
      )
    ).toStrictEqual([
      'CREATE INDEX ON "Appointment" ("projectId", "status")',
      'CREATE UNIQUE INDEX ON "Patient" ("id")',
    ]);
  });

  test('Ignores empty input', () => {
    expect(parseHypotheticalIndexStatements(undefined)).toStrictEqual([]);
    expect(parseHypotheticalIndexStatements('')).toStrictEqual([]);
    expect(parseHypotheticalIndexStatements(['', '  ;  '])).toStrictEqual([]);
  });

  test('Rejects statements that are not CREATE INDEX', () => {
    expect(() => parseHypotheticalIndexStatements('DROP INDEX "Patient_id_idx"')).toThrow(OperationOutcomeError);
  });

  test('Rejects CONCURRENTLY', () => {
    expect(() => parseHypotheticalIndexStatements('CREATE INDEX CONCURRENTLY ON "Patient" ("active")')).toThrow(
      OperationOutcomeError
    );
  });
});

describe('isUndefinedFunctionError', () => {
  test('Detects missing PostgreSQL functions', () => {
    expect(isUndefinedFunctionError({ code: '42883' })).toBe(true);
    expect(isUndefinedFunctionError({ code: '42P01' })).toBe(false);
    expect(isUndefinedFunctionError('nope')).toBe(false);
    expect(isUndefinedFunctionError(null)).toBe(false);
  });
});

describe('withHypotheticalIndexes', () => {
  test('creates indexes and explains in one transaction, then rolls back and resets', async () => {
    const calls: string[] = [];
    const repo = {
      executeRawSql: vi.fn(async (sql: string) => {
        calls.push(sql);
        return sql.includes('hypopg_create_index')
          ? [{ indexrelid: '13607', indexname: '<13607>btree_Patient_active' }]
          : [];
      }),
    } as unknown as Repository;

    const result = await withHypotheticalIndexes(
      repo,
      ['Patient'],
      ['CREATE INDEX ON "Patient" ("active")'],
      async () => {
        calls.push('EXPLAIN');
        return { result: ['plan'] };
      }
    );

    expect(result).toStrictEqual({
      result: ['plan'],
      hypotheticalIndexes: ['<13607>btree_Patient_active: CREATE INDEX ON "Patient" ("active")'],
    });
    expect(calls).toStrictEqual([
      'BEGIN READ ONLY',
      'SELECT hypopg_reset()',
      'SELECT indexrelid, indexname FROM hypopg_create_index($1)',
      'EXPLAIN',
      'ROLLBACK',
      'SELECT hypopg_reset()',
    ]);
  });

  test('rolls back and resets when EXPLAIN fails', async () => {
    const calls: string[] = [];
    const repo = {
      executeRawSql: vi.fn(async (sql: string) => {
        calls.push(sql);
        return sql.includes('hypopg_create_index') ? [{ indexrelid: '1', indexname: '<1>idx' }] : [];
      }),
    } as unknown as Repository;

    await expect(
      withHypotheticalIndexes(repo, ['Patient'], ['CREATE INDEX ON "Patient" ("active")'], async () => {
        calls.push('EXPLAIN');
        throw new Error('explain failed');
      })
    ).rejects.toThrow('explain failed');

    expect(calls.slice(-2)).toStrictEqual(['ROLLBACK', 'SELECT hypopg_reset()']);
  });
});

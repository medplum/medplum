// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError } from '@medplum/core';
import type { Repository } from '../repo';
import { loadStructureDefinitions } from '../structure';
import { inferExplainResourceTypes, normalizeExplainSql, withHypotheticalIndexes } from './explain';

beforeAll(() => {
  loadStructureDefinitions();
});

describe('normalizeExplainSql', () => {
  test('Accepts SELECT and WITH and strips a trailing semicolon', () => {
    expect(normalizeExplainSql('  SELECT 1;  ')).toBe('SELECT 1');
    expect(normalizeExplainSql('WITH x AS (SELECT 1) SELECT * FROM x')).toBe('WITH x AS (SELECT 1) SELECT * FROM x');
  });

  test('Rejects empty, multi-statement, and non-SELECT SQL', () => {
    expect(() => normalizeExplainSql('   ')).toThrow(OperationOutcomeError);
    expect(() => normalizeExplainSql('SELECT 1; SELECT 2')).toThrow(OperationOutcomeError);
    expect(() => normalizeExplainSql('DELETE FROM "Patient"')).toThrow(OperationOutcomeError);
  });
});

describe('inferExplainResourceTypes', () => {
  test('Infers resource types from quoted identifiers', () => {
    expect(inferExplainResourceTypes('SELECT * FROM "Patient" JOIN "Appointment" ON true')).toStrictEqual([
      'Patient',
      'Appointment',
    ]);
    expect(inferExplainResourceTypes('SELECT * FROM "Patient_History"')).toStrictEqual(['Patient']);
  });

  test('Falls back to Project when no resource tables are quoted', () => {
    expect(inferExplainResourceTypes('SELECT 1')).toStrictEqual(['Project']);
  });
});

describe('withHypotheticalIndexes', () => {
  function mockRepo(): Repository & {
    executeRawSql: ReturnType<typeof vi.fn>;
    withTransaction: ReturnType<typeof vi.fn>;
  } {
    const repo = {
      executeRawSql: vi.fn(async () => []),
      withTransaction: vi.fn(async (callback: (txRepo: Repository) => Promise<unknown>) =>
        callback(repo as unknown as Repository)
      ),
    };
    return repo as unknown as Repository & {
      executeRawSql: ReturnType<typeof vi.fn>;
      withTransaction: ReturnType<typeof vi.fn>;
    };
  }

  test('runs EXPLAIN in a read-only transaction', async () => {
    const repo = mockRepo();
    const calls: string[] = [];
    repo.executeRawSql.mockImplementation(async (sql: string) => {
      calls.push(sql);
      return [];
    });

    const result = await withHypotheticalIndexes(repo, ['Patient'], [], async (txRepo) => {
      calls.push('EXPLAIN');
      expect(txRepo).toBe(repo);
      return { result: ['plan'] };
    });

    expect(result).toStrictEqual({ result: ['plan'] });
    expect(calls).toStrictEqual(['SET TRANSACTION READ ONLY', 'EXPLAIN']);
    expect(repo.withTransaction).toHaveBeenCalledOnce();
  });

  test('resets HypoPG state when EXPLAIN fails', async () => {
    const repo = mockRepo();
    const calls: string[] = [];
    repo.executeRawSql.mockImplementation(async (sql: string) => {
      calls.push(sql);
      return [];
    });

    await expect(
      withHypotheticalIndexes(repo, ['Patient'], ['CREATE INDEX ON "Patient" ("active")'], async () => {
        calls.push('EXPLAIN');
        throw new Error('explain failed');
      })
    ).rejects.toThrow('explain failed');

    expect(calls).toStrictEqual([
      'SET TRANSACTION READ ONLY',
      'SELECT hypopg_reset()',
      'SELECT hypopg_create_index($1)',
      'EXPLAIN',
      'SELECT hypopg_reset()',
    ]);
  });
});

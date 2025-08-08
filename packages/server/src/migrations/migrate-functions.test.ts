// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Client, escapeIdentifier, Pool } from 'pg';
import { loadTestConfig } from '../config/loader';
import { MedplumServerConfig } from '../config/types';
import { closeDatabase, DatabaseMode, getDatabasePool, initDatabase } from '../database';
import { analyzeTable, idempotentCreateIndex } from './migrate-functions';
import { MigrationActionResult } from './types';

interface IndexInfo {
  index_name: string;
  is_valid: boolean;
  is_live: boolean;
  index_definition: string;
}
async function getTableIndexes(client: Client | Pool, tableName: string): Promise<IndexInfo[]> {
  return client
    .query<IndexInfo>(
      `SELECT
        t.relname AS table_name,
        i.relname AS index_name,
        idx.indexrelid AS index_oid,
        idx.indrelid AS table_oid,
        idx.indisunique AS is_unique,
        idx.indisprimary AS is_primary,
        idx.indisvalid AS is_valid,
        idx.indislive AS is_live,
        am.amname AS index_type,
        pg_get_indexdef(idx.indexrelid) AS index_definition
        FROM pg_index idx
        JOIN pg_class i ON i.oid = idx.indexrelid
        JOIN pg_class t ON t.oid = idx.indrelid
        JOIN pg_am am ON am.oid = i.relam
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE t.relname = $1 AND n.nspname = 'public'`,
      [tableName]
    )
    .then((results) => results.rows);
}

describe('migrate-functions', () => {
  let config: MedplumServerConfig;
  let client: Pool;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initDatabase(config);
    client = getDatabasePool(DatabaseMode.WRITER);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  const tableName = 'Test_Table';
  const escapedTableName = escapeIdentifier(tableName);

  beforeEach(async () => {
    // Create a test table
    await client.query(`DROP TABLE IF EXISTS ${escapedTableName}`);
    await client.query(`CREATE TABLE ${escapedTableName} (id INTEGER, name TEXT)`);
  });

  afterEach(async () => {
    // Clean up test table and indexes
    await client.query(`DROP TABLE IF EXISTS ${escapedTableName}`);
  });

  describe('idempotentCreateIndex', () => {
    const indexName = 'Test_index_1';
    const createIndexSql = `CREATE INDEX CONCURRENTLY ${escapeIdentifier(indexName)} ON ${escapedTableName} (id)`;
    const indexDefinition = `CREATE INDEX ${escapeIdentifier(indexName)} ON public.${escapedTableName} USING btree (id)`;

    test('is idempotent', async () => {
      const actions: MigrationActionResult[] = [];
      await idempotentCreateIndex(client, actions, indexName, createIndexSql);
      expect(actions).toEqual([{ name: createIndexSql, durationMs: expect.any(Number) }]);
      const indexes1 = await getTableIndexes(client, tableName);
      expect(indexes1).toHaveLength(1);
      expect(indexes1[0]).toEqual(
        expect.objectContaining({
          index_name: indexName,
          is_valid: true,
          is_live: true,
          index_definition: indexDefinition,
        })
      );

      // invoked twice to ensure idempotency; no actions this time
      const actions2: MigrationActionResult[] = [];
      await idempotentCreateIndex(client, actions2, indexName, createIndexSql);
      expect(actions2).toHaveLength(0);
      const indexes2 = await getTableIndexes(client, tableName);
      expect(indexes2).toHaveLength(1);
      expect(indexes2[0]).toEqual(
        expect.objectContaining({
          index_name: indexName,
          is_valid: true,
          is_live: true,
          index_definition: indexDefinition,
        })
      );

      // Simulate an index that failed during creation: invalid
      await client.query(
        `UPDATE pg_index SET indisvalid = false
      FROM pg_class WHERE pg_class.oid = pg_index.indexrelid 
      AND pg_class.relname = $1`,
        [indexName]
      );
      const simulateFailedIndexes = await getTableIndexes(client, tableName);
      expect(simulateFailedIndexes).toHaveLength(1);
      expect(simulateFailedIndexes[0]).toEqual(
        expect.objectContaining({
          index_name: indexName,
          is_valid: false,
          index_definition: indexDefinition,
        })
      );

      const actions3: MigrationActionResult[] = [];
      await idempotentCreateIndex(client, actions3, indexName, createIndexSql);
      expect(actions3).toEqual([
        { name: `DROP INDEX IF EXISTS "${indexName}"`, durationMs: expect.any(Number) },
        { name: createIndexSql, durationMs: expect.any(Number) },
      ]);
      const indexes3 = await getTableIndexes(client, tableName);
      expect(indexes3).toHaveLength(1);
      expect(indexes3[0]).toEqual(
        expect.objectContaining({
          index_name: indexName,
          is_valid: true,
          is_live: true,
          index_definition: indexDefinition,
        })
      );
    });
  });

  describe('analyzeTable', () => {
    test('should analyze table', async () => {
      const results: MigrationActionResult[] = [];
      await analyzeTable(client, results, tableName);
      expect(results).toEqual([
        {
          name: `ANALYZE ${escapedTableName}`,
          durationMs: expect.any(Number),
        },
      ]);
    });
  });
});

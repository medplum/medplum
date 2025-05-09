import { Client, Pool } from 'pg';
import { loadTestConfig } from '../config/loader';
import { MedplumServerConfig } from '../config/types';
import { closeDatabase, DatabaseMode, getDatabasePool, initDatabase } from '../database';
import { idempotentCreateIndex, MigrationActionResult } from './migrate-functions';

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

describe('idempotentCreateIndex', () => {
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

  beforeEach(async () => {
    // Create a test table
    await client.query('DROP TABLE IF EXISTS test_table');
    await client.query('CREATE TABLE test_table (id INTEGER, name TEXT)');
  });

  afterEach(async () => {
    // Clean up test table and indexes
    await client.query('DROP TABLE IF EXISTS test_table');
  });

  const indexName = 'test_index_1';
  const createIndexSql = 'CREATE INDEX CONCURRENTLY test_index_1 ON test_table (id)';
  const indexDefinition = 'CREATE INDEX test_index_1 ON public.test_table USING btree (id)';

  test('is idempotent', async () => {
    const actions: MigrationActionResult[] = [];
    await idempotentCreateIndex(client, actions, indexName, createIndexSql);
    expect(actions).toEqual([{ name: createIndexSql, durationMs: expect.any(Number) }]);
    const indexes1 = await getTableIndexes(client, 'test_table');
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
    const indexes2 = await getTableIndexes(client, 'test_table');
    expect(indexes2).toHaveLength(1);
    expect(indexes2[0]).toEqual(
      expect.objectContaining({
        index_name: indexName,
        is_valid: true,
        is_live: true,
        index_definition: indexDefinition,
      })
    );

    // Simulate an index that failed during creation: invalid and not live
    await client.query(
      `UPDATE pg_index SET indisvalid = false, indislive = false 
      FROM pg_class WHERE pg_class.oid = pg_index.indexrelid 
      AND pg_class.relname = $1`,
      [indexName]
    );
    const simulateFailedIndexes = await getTableIndexes(client, 'test_table');
    expect(simulateFailedIndexes).toHaveLength(1);
    expect(simulateFailedIndexes[0]).toEqual(
      expect.objectContaining({
        index_name: indexName,
        is_valid: false,
        is_live: false,
        index_definition: indexDefinition,
      })
    );

    const actions3: MigrationActionResult[] = [];
    await idempotentCreateIndex(client, actions3, indexName, createIndexSql);
    expect(actions3).toEqual([
      { name: `DROP INDEX IF EXISTS ${indexName}`, durationMs: expect.any(Number) },
      { name: createIndexSql, durationMs: expect.any(Number) },
    ]);
    const indexes3 = await getTableIndexes(client, 'test_table');
    expect(indexes3).toHaveLength(1);
    expect(indexes3[0]).toEqual(
      expect.objectContaining({
        index_name: indexName,
        is_valid: true,
        is_live: true,
        index_definition: indexDefinition,
      })
    );

    // Simulate an index that is being created by some other client: invalid but live
    await client.query(
      `UPDATE pg_index SET indisvalid = false, indislive = true 
      FROM pg_class WHERE pg_class.oid = pg_index.indexrelid 
      AND pg_class.relname = $1`,
      [indexName]
    );
    const simulateCompetingClientIndexes = await getTableIndexes(client, 'test_table');
    expect(simulateCompetingClientIndexes).toHaveLength(1);
    expect(simulateCompetingClientIndexes[0]).toEqual(
      expect.objectContaining({
        index_name: indexName,
        is_valid: false,
        is_live: true,
        index_definition: indexDefinition,
      })
    );

    // Fails because index is being created by some other client
    await expect(idempotentCreateIndex(client, [], indexName, createIndexSql)).rejects.toThrow(
      'Another client is actively creating index'
    );
  });
});

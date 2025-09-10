// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Client, escapeIdentifier, Pool } from 'pg';
import { loadTestConfig } from '../config/loader';
import { MedplumServerConfig } from '../config/types';
import { closeDatabase, DatabaseMode, getDatabasePool, initDatabase } from '../database';
import { Column, SelectQuery, UpdateQuery } from '../fhir/sql';
import {
  addCheckConstraint,
  analyzeTable,
  batchedUpdate,
  idempotentCreateIndex,
  nonBlockingAddCheckConstraint,
  nonBlockingAlterColumnNotNull,
} from './migrate-functions';
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
    await client.query(`CREATE TABLE ${escapedTableName} (id INTEGER NOT NULL, name TEXT)`);
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

  describe('nonBlockingAlterColumnNotNull', () => {
    test('throws if there are NULL values', async () => {
      const columnName = 'name';

      const results: MigrationActionResult[] = [];

      // insert rows, some with name as null
      await client.query(`INSERT INTO ${escapedTableName} (id, name) VALUES (1, NULL), (2, NULL), (3, 'not null')`);

      // expect error because there are 2 rows with NULL values
      await expect(nonBlockingAlterColumnNotNull(client, results, tableName, columnName)).rejects.toThrow(
        `Cannot alter "${tableName}"."${columnName}" to NOT NULL because there are 2 rows with NULL values`
      );

      // update all rows where name is null to be 'fixed'
      await client.query(`UPDATE ${escapedTableName} SET name = 'fixed' WHERE name IS NULL`);

      // expect success
      await nonBlockingAlterColumnNotNull(client, results, tableName, columnName);

      // attempting to insert a row where name is null should fail
      await expect(client.query(`INSERT INTO ${escapedTableName} (id, name) VALUES (4, NULL)`)).rejects.toThrow(
        /violates not-null constraint/
      );
    });

    test('happy path', async () => {
      const results: MigrationActionResult[] = [];
      await nonBlockingAlterColumnNotNull(client, results, tableName, 'name');
      expect(results).toStrictEqual([
        {
          durationMs: expect.any(Number),
          name: 'SELECT COUNT(*) FROM "Test_Table" WHERE "name" IS NULL',
        },
        {
          durationMs: expect.any(Number),
          name: 'ALTER TABLE "Test_Table" ADD CONSTRAINT "Test_Table_name_not_null" CHECK ("name" IS NOT NULL) NOT VALID',
        },
        {
          durationMs: expect.any(Number),
          name: 'ALTER TABLE "Test_Table" VALIDATE CONSTRAINT "Test_Table_name_not_null"',
        },
        {
          durationMs: expect.any(Number),
          name: 'ALTER TABLE "Test_Table" ALTER COLUMN "name" SET NOT NULL',
        },
        {
          durationMs: expect.any(Number),
          name: 'ALTER TABLE "Test_Table" DROP CONSTRAINT "Test_Table_name_not_null"',
        },
      ]);

      // idempotent
      const idempotentResults: MigrationActionResult[] = [];
      await nonBlockingAlterColumnNotNull(client, idempotentResults, tableName, 'name');
      expect(idempotentResults).toStrictEqual([]);
    });

    test('noop if column is already NOT NULL', async () => {
      const results: MigrationActionResult[] = [];
      await nonBlockingAlterColumnNotNull(client, results, tableName, 'id');
      expect(results).toStrictEqual([]);
    });
  });

  describe('nonBlockingAddConstraint', () => {
    test('is idempotent', async () => {
      const results: MigrationActionResult[] = [];

      await client.query(`INSERT INTO ${escapedTableName} (id, name) VALUES (1, NULL), (2, NULL), (3, 'not null')`);

      const constraintName = 'Table_Name_reserved_id_check';

      await nonBlockingAddCheckConstraint(client, results, tableName, constraintName, `id <> 5`);

      const expectedResults = [
        {
          name: `ALTER TABLE ${escapedTableName} ADD CONSTRAINT "${constraintName}" CHECK (id <> 5) NOT VALID`,
          durationMs: expect.any(Number),
        },
        {
          durationMs: expect.any(Number),
          name: `ALTER TABLE ${escapedTableName} VALIDATE CONSTRAINT "${constraintName}"`,
        },
      ];
      expect(results).toStrictEqual(expectedResults);

      //idempotent
      await nonBlockingAddCheckConstraint(client, results, tableName, constraintName, `id <> 5`);

      expect(results).toStrictEqual(expectedResults);
    });

    test('validates existing invalid constraint', async () => {
      // test setup; create an invalid constraint
      await addCheckConstraint(client, [], tableName, 'Table_Name_reserved_id_check', `id <> 5`, true);

      await client.query(`INSERT INTO ${escapedTableName} (id, name) VALUES (1, NULL), (2, NULL), (3, 'not null')`);

      const results: MigrationActionResult[] = [];
      await nonBlockingAddCheckConstraint(client, results, tableName, 'Table_Name_reserved_id_check', `id <> 5`);

      const expectedResults = [
        {
          durationMs: expect.any(Number),
          name: `ALTER TABLE ${escapedTableName} VALIDATE CONSTRAINT "Table_Name_reserved_id_check"`,
        },
      ];
      expect(results).toStrictEqual(expectedResults);
    });
  });

  describe('batchedUpdate', () => {
    test.each([1, 10])('should update rows in batches with %i maxIterations', async (maxIterations) => {
      await client.query(
        `INSERT INTO ${escapedTableName} (id, name) VALUES (1, NULL), (2, NULL), (3, 'not null'), (4, NULL)`
      );

      const results: MigrationActionResult[] = [];
      const update = new UpdateQuery(tableName, ['id']);
      const cte = { name: 'cte', expr: new SelectQuery(tableName).column('id').where('name', '=', null).limit(2) };
      update.from(cte);
      update.set('name', 'new default');
      update.where(new Column(cte.name, 'id'), '=', new Column(tableName, 'id'));

      if (maxIterations < 3) {
        await expect(batchedUpdate(client, results, update, maxIterations)).rejects.toThrow(
          `Exceeded max iterations of ${maxIterations}`
        );
        return;
      }

      await batchedUpdate(client, results, update, maxIterations);

      const expectedQuery =
        'WITH "cte" AS (SELECT "Test_Table"."id" FROM "Test_Table" WHERE "Test_Table"."name" IS NULL LIMIT 2) UPDATE "Test_Table" SET "name" = $1 FROM "cte" WHERE "cte"."id" = "Test_Table"."id" RETURNING "Test_Table"."id"';

      expect(results).toEqual([
        {
          name: expectedQuery,
          durationMs: expect.any(Number),
          iterations: 3,
        },
      ]);

      const result = await client.query(`SELECT * FROM ${escapedTableName} ORDER BY id`);
      expect(result.rowCount).toBe(4);
      expect(result.rows).toStrictEqual([
        { id: 1, name: 'new default' },
        { id: 2, name: 'new default' },
        { id: 3, name: 'not null' },
        { id: 4, name: 'new default' },
      ]);
    });
  });
});

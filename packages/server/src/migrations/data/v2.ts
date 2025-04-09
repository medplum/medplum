import { Pool, PoolClient } from 'pg';
import { CustomMigrationAction, CustomPostDeployMigration } from './types';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import { getDatabasePool, DatabaseMode } from '../../database';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => {
    return runCustomMigration(repo, job, jobData, async () => {
      return withLongRunningDatabaseClient(async (client) => {
        const actions: CustomMigrationAction[] = [];
        await run(client, actions);
        return { actions };
      });
    });
  },
};

// prettier-ignore
async function run(client: PoolClient, actions: CustomMigrationAction[]): Promise<void> {
  await idempotentCreateIndex(client, actions, 'Group_characteristicReference_idx', 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Group_characteristicReference_idx" ON "Group" USING gin ("characteristicReference")');
}

//TODO: The following is temporary code and should be removed after
// https://github.com/medplum/medplum/pull/6291 is merged since they are more
// formally added and tested in that PR.

type MigrationAction = { name: string; durationMs: number };

async function idempotentCreateIndex(
  client: Pool | PoolClient,
  actions: MigrationAction[],
  indexName: string,
  createIndexSql: string
): Promise<void> {
  const existsResult = await client.query<{ exists: boolean; live: boolean; invalid: boolean }>(
    `SELECT 
       EXISTS(SELECT 1 FROM pg_class WHERE relname = $1) AS exists,
       EXISTS(SELECT 1 
           FROM pg_index idx 
           JOIN pg_class i ON i.oid = idx.indexrelid 
           WHERE i.relname = $1 AND idx.indislive
       ) AS live,
       EXISTS(SELECT 1 
           FROM pg_index idx 
           JOIN pg_class i ON i.oid = idx.indexrelid 
           WHERE i.relname = $1 AND NOT idx.indisvalid
       ) AS invalid`,
    [indexName]
  );
  const { invalid, live } = existsResult.rows[0];
  let exists = existsResult.rows[0].exists;

  if (exists && invalid) {
    if (live) {
      throw new Error('Another client is actively creating index ' + indexName);
    }

    const start = Date.now();
    await client.query(`DROP INDEX IF EXISTS ${indexName}`);
    actions.push({ name: `DROP INDEX IF EXISTS ${indexName}`, durationMs: Date.now() - start });
    exists = false;
  }

  if (!exists) {
    const start = Date.now();
    await client.query(createIndexSql);
    actions.push({ name: createIndexSql, durationMs: Date.now() - start });
  }
}

async function withLongRunningDatabaseClient<TResult>(
  callback: (client: PoolClient) => Promise<TResult>
): Promise<TResult> {
  const pool = getDatabasePool(DatabaseMode.WRITER);
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout TO 0`);
    return await callback(client);
  } finally {
    client.release(true);
  }
}

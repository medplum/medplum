import { Client, escapeIdentifier, Pool, PoolClient } from 'pg';
import { globalLogger } from '../logger';
import { MigrationActionResult } from './types';

export async function query(
  client: Client | Pool | PoolClient,
  results: MigrationActionResult[],
  queryStr: string
): Promise<void> {
  const start = Date.now();
  await client.query(queryStr);
  results.push({ name: queryStr, durationMs: Date.now() - start });
}

/**
 * Creates an index if it does not exist. If the index exists but is invalid, it will be dropped and recreated.
 * If the index exists and is valid, no action will be taken. This function is useful to recover from
 * failed concurrent index creation attempts, e.g. a post-deploy migration in the middle of creating a large
 * index that could take many minutes to complete is interrupted due to a server deployment or the worker
 * performing the migration is interrupted/crashes for any other reason.
 *
 * @param client - The database client or pool.
 * @param results - The list of action results to push operations performed.
 * @param indexName - The name of the index to create.
 * @param createIndexSql - The SQL to create the index.
 */
export async function idempotentCreateIndex(
  client: Client | Pool | PoolClient,
  results: MigrationActionResult[],
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
    const dropQuery = `DROP INDEX IF EXISTS ${escapeIdentifier(indexName)}`;
    await client.query(dropQuery);
    const durationMs = Date.now() - start;
    globalLogger.debug('Dropped invalid index', { indexName, durationMs });
    results.push({ name: dropQuery, durationMs });
    exists = false;
  }

  if (!exists) {
    const start = Date.now();
    await client.query(createIndexSql);
    const durationMs = Date.now() - start;
    globalLogger.debug('Created index', { indexName, durationMs });
    results.push({ name: createIndexSql, durationMs });
  }
}

export async function analyzeTable(
  client: Client | Pool | PoolClient,
  actions: MigrationActionResult[],
  tableName: string
): Promise<void> {
  const start = Date.now();
  const analyzeQuery = `ANALYZE ${escapeIdentifier(tableName)}`;
  await client.query(analyzeQuery);
  const durationMs = Date.now() - start;
  globalLogger.debug('Analyzed table', { tableName, durationMs });
  actions.push({ name: analyzeQuery, durationMs });
}

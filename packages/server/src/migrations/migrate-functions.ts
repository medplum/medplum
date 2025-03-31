import { Pool, PoolClient } from 'pg';

type Action = { name: string; durationMs: number };

export async function query(client: PoolClient, actions: Action[], queryStr: string): Promise<void> {
  const start = Date.now();
  await client.query(queryStr);
  actions.push({ name: queryStr, durationMs: Date.now() - start });
}

export async function idempotentCreateIndex(
  client: Pool | PoolClient,
  actions: Action[],
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

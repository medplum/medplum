import { Pool, PoolClient } from 'pg';
import { MedplumDatabaseConfig } from './config';
import * as v1 from './migrations/v1';

let pool: Pool | undefined;

export function getClient(): Pool {
  if (!pool) {
    throw new Error('Database not setup');
  }
  return pool;
}

export async function initDatabase(config: MedplumDatabaseConfig): Promise<void> {
  pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.dbname,
    user: config.username,
    password: config.password
  });

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await migrate(client);
  } finally {
    if (client) {
      client.release();
    }
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    pool.end();
    pool = undefined;
  }
}

async function migrate(client: PoolClient): Promise<void> {
  await client.query(`CREATE TABLE IF NOT EXISTS "DatabaseMigration" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL
  )`);

  const result = await client.query('SELECT "version" FROM "DatabaseMigration"');
  const version = result.rows?.[0]?.version ?? -1;

  if (version < 0) {
    await client.query('INSERT INTO "DatabaseMigration" ("id", "version") VALUES (1, 0)');
  }

  if (version < 1) {
    await v1.run(client);
    await client.query('UPDATE "DatabaseMigration" SET "version"=1 WHERE "id"=1');
  }
}

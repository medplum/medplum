import { Pool, PoolClient } from 'pg';
import { MedplumDatabaseConfig } from './config';
import * as v1 from './migrations/v1';
import * as v2 from './migrations/v2';
import * as v3 from './migrations/v3';
import * as v4 from './migrations/v4';
import * as v5 from './migrations/v5';
import * as v6 from './migrations/v6';

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

  if (version < 2) {
    await v2.run(client);
    await client.query('UPDATE "DatabaseMigration" SET "version"=2 WHERE "id"=1');
  }

  if (version < 3) {
    await v3.run(client);
    await client.query('UPDATE "DatabaseMigration" SET "version"=3 WHERE "id"=1');
  }

  if (version < 4) {
    await v4.run(client);
    await client.query('UPDATE "DatabaseMigration" SET "version"=4 WHERE "id"=1');
  }

  if (version < 5) {
    await v5.run(client);
    await client.query('UPDATE "DatabaseMigration" SET "version"=5 WHERE "id"=1');
  }

  if (version < 6) {
    await v6.run(client);
    await client.query('UPDATE "DatabaseMigration" SET "version"=6 WHERE "id"=1');
  }
}

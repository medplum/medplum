import { Pool, PoolClient } from 'pg';
import { MedplumServerConfig } from './config';
import { globalLogger } from './logger';
import * as migrations from './migrations/schema';

let pool: Pool | undefined;

export function getClient(): Pool {
  if (!pool) {
    throw new Error('Database not setup');
  }
  return pool;
}

export const locks = {
  migration: 1,
};

export async function initDatabase(serverConfig: MedplumServerConfig, runMigrations = true): Promise<void> {
  const config = serverConfig.database;

  const poolConfig = {
    host: config.host,
    port: config.port,
    database: config.dbname,
    user: config.username,
    password: config.password,
    ssl: config.ssl,

    // Allow minimum number of clients to be zero
    // This prevents the pool from crashing if the last connection is released
    // See: https://github.com/brianc/node-postgres/issues/2112#issuecomment-800416194
    min: 0,

    // maximum number of clients the pool should contain
    // by default this is set to 10.
    max: 10,

    // number of milliseconds to wait before timing out when connecting a new client
    // by default this is 0 which means no timeout
    connectionTimeoutMillis: 2000,

    // number of milliseconds a client must sit idle in the pool and not be checked out
    // before it is disconnected from the backend and discarded
    // default is 10000 (10 seconds) - set to 0 to disable auto-disconnection of idle clients
    idleTimeoutMillis: 10000,
  };

  if (serverConfig.databaseProxyEndpoint) {
    poolConfig.host = serverConfig.databaseProxyEndpoint;
    poolConfig.ssl = poolConfig.ssl ?? {};
    poolConfig.ssl.require = true;
  }

  pool = new Pool(poolConfig);

  pool.on('error', (err) => {
    globalLogger.error('Database connection error', err);
  });

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('SELECT pg_advisory_lock($1)', [locks.migration]);
    if (runMigrations) {
      await migrate(client);
    }
  } finally {
    if (client) {
      await client.query('SELECT pg_advisory_unlock($1)', [locks.migration]);
      client.release();
    }
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

async function migrate(client: PoolClient): Promise<void> {
  await client.query(`CREATE TABLE IF NOT EXISTS "DatabaseMigration" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL,
    "dataVersion" INTEGER NOT NULL
  )`);

  const result = await client.query('SELECT "version" FROM "DatabaseMigration"');
  const version = result.rows[0]?.version ?? -1;

  if (version < 0) {
    await client.query('INSERT INTO "DatabaseMigration" ("id", "version", "dataVersion") VALUES (1, 0, 0)');
  }

  const migrationKeys = Object.keys(migrations);
  for (let i = version + 1; i <= migrationKeys.length; i++) {
    const migration = (migrations as Record<string, migrations.Migration>)['v' + i];
    if (migration) {
      const start = Date.now();
      await migration.run(client);
      globalLogger.info('Database schema migration', { version: `v${i}`, duration: `${Date.now() - start} ms` });
      await client.query('UPDATE "DatabaseMigration" SET "version"=$1', [i]);
    }
  }
}

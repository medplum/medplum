import { Pool, PoolClient } from 'pg';
import { MedplumServerConfig } from './config';
import { globalLogger } from './logger';
import * as migrations from './migrations/schema';

let pool: Pool | undefined;

export function getDatabasePool(): Pool {
  if (!pool) {
    throw new Error('Database not setup');
  }
  return pool;
}

export const locks = {
  migration: 1,
};

export async function initDatabase(serverConfig: MedplumServerConfig): Promise<void> {
  const config = serverConfig.database;

  const poolConfig = {
    host: config.host,
    port: config.port,
    database: config.dbname,
    user: config.username,
    password: config.password,
    ssl: config.ssl,
    max: 50,
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

  pool.on('connect', (client) => {
    client.query(`SET statement_timeout TO ${config.queryTimeout ?? 60000}`).catch((err) => {
      globalLogger.warn('Failed to set query timeout', err);
    });
    client.query(`SET default_transaction_isolation TO 'REPEATABLE READ'`).catch((err) => {
      globalLogger.warn('Failed to set default transaction isolation', err);
    });
  });

  let client: PoolClient | undefined;
  // Run migrations by default
  if (config.runMigrations !== false) {
    try {
      client = await pool.connect();
      await client.query('SELECT pg_advisory_lock($1)', [locks.migration]);
      await migrate(client);
    } finally {
      if (client) {
        await client.query('SELECT pg_advisory_unlock($1)', [locks.migration]);
        client.release();
      }
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

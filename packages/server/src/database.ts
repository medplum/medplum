import { Pool, PoolClient } from 'pg';
import { MedplumDatabaseConfig } from './config';
import { migrateDatabase } from './migrations/0_init';

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
    database: config.database,
    user: config.username,
    password: config.password
  });

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await migrateDatabase(client);
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

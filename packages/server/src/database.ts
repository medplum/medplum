import { normalizeErrorString } from '@medplum/core';
import { Pool, PoolClient, QueryResult } from 'pg';
import { EventEmitter } from 'stream';
import { MedplumServerConfig } from './config';
import { getAuthenticatedContext } from './context';
import { globalLogger } from './logger';
import * as migrations from './migrations/schema';

let globalPool: Pool | undefined;
const pools = new Map<string, MedplumPool>();
const DEFAULT_PROJECT_MAX_CONNECTIONS = 10;

// 1 pool per project
// global pool

interface DeferredQuery {
  sql: string;
  resolve: (result: QueryResult) => void;
  reject: (err: Error) => void;
}

interface MedplumPoolOptions {
  max?: number;
  inheritFrom?: MedplumPool;
}

class MedplumPool extends EventEmitter implements Pool {
  static MAX_WAITING = 10;
  private queue: DeferredQuery[] = [];
  private connectionCount = 0;
  private max: number;
  readonly releaseListener: () => Promise<void>;

  constructor(
    readonly pool: Pool,
    readonly options?: MedplumPoolOptions
  ) {
    super();
    this.max = options?.max ?? 10;

    this.releaseListener = async () => {
      if (this.pool.waitingCount > MedplumPool.MAX_WAITING) {
        return;
      }

      // If current connections are less than max on release, then call Pool.query on first query in queue
      if (this.connectionCount < this.max && this.queue.length) {
        const deferredQuery = this.queue.shift() as DeferredQuery;
        try {
          const result = await this.executeQuery(deferredQuery.sql);
          deferredQuery.resolve(result);
        } catch (err) {
          deferredQuery.reject(err as Error);
        }
      }
    };

    this.pool.on('release', this.releaseListener);
  }

  getMax(): number {
    return this.max;
  }

  setMax(max: number): void {
    this.max = max;
  }

  cleanup(): void {
    this.pool.off('release', this.releaseListener);
  }

  private async executeQuery(sql: string): Promise<QueryResult> {
    let result: QueryResult;
    try {
      this.connectionCount++;
      result = await this.pool.query(sql);
    } finally {
      this.connectionCount--;
    }
    return result;
  }

  async query(sql: string): Promise<QueryResult> {
    let query: Promise<QueryResult>;

    if (this.connectionCount === this.max) {
      let resolve!: (result: QueryResult) => void;
      let reject!: (err: Error) => void;
      const deferredPromise = new Promise<QueryResult>((_resolve, _reject) => {
        resolve = _reject;
        reject = _reject;
      });
      this.queue.push({ sql, resolve, reject });
      query = deferredPromise;
    } else {
      query = this.executeQuery(sql);
    }

    return query;
  }

  get totalCount(): number {
    return this.pool.totalCount;
  }

  get waitingCount(): number {
    return this.pool.waitingCount;
  }

  get idleCount(): number {
    return this.pool.idleCount;
  }

  connect(...args: any[]): Promise<PoolClient> {
    throw new Error('Not implemented for MedplumPool');
  }
}

// Solve problem with reloading
// Use Pool interface

export function getDatabasePool(): Pool {
  if (!globalPool) {
    throw new Error('Database not setup');
  }
  try {
    const project = getAuthenticatedContext().project;
    const projectId = project.id as string;

    let projectMax: number | undefined = undefined;

    const systemSetting = project.systemSetting?.find((s) => s.name === 'maxConnections');
    if (systemSetting?.valueInteger) {
      projectMax = systemSetting.valueInteger;
    }

    let projectPool: MedplumPool;

    if (!pools.has(projectId)) {
      projectPool = new MedplumPool(globalPool, { max: projectMax });
      pools.set(projectId, projectPool);
      return projectPool;
    }

    projectPool = pools.get(projectId) as MedplumPool;
    if (projectMax && projectPool.getMax() !== projectMax) {
      projectPool.setMax(projectMax);
    }

    return projectPool;
  } catch (err) {
    globalLogger.debug(`Error getting database pool: ${normalizeErrorString(err)}`);
    return globalPool;
  }
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
  };

  if (serverConfig.databaseProxyEndpoint) {
    poolConfig.host = serverConfig.databaseProxyEndpoint;
    poolConfig.ssl = poolConfig.ssl ?? {};
    poolConfig.ssl.require = true;
  }

  globalPool = new Pool(poolConfig);

  globalPool.on('error', (err) => {
    globalLogger.error('Database connection error', err);
  });

  globalPool.on('connect', (client) => {
    client.query(`SET statement_timeout TO ${config.queryTimeout ?? 60000}`).catch((err) => {
      globalLogger.warn('Failed to set query timeout', err);
    });
  });

  let client: PoolClient | undefined;
  try {
    client = await globalPool.connect();
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
  if (globalPool) {
    await globalPool.end();
    globalPool = undefined;
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

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import type { PoolClient } from 'pg';
import * as semver from 'semver';
import type { MedplumDatabaseConfig, MedplumServerConfig } from './config/types';
import { globalLogger } from './logger';
import { getPostDeployVersion, getPreDeployVersion } from './migration-sql';
import {
  enforceStrictMigrationVersionChecks,
  getPendingPostDeployMigration,
  getPostDeployManifestEntry,
  getPreDeployMigration,
} from './migrations/migration-utils';
import { getPreDeployMigrationVersions, MigrationVersion } from './migrations/migration-versions';
import { DefaultShardPool } from './sharding/shard-pool';
import type { ShardPool, ShardPoolClient } from './sharding/sharding-types';
import { GLOBAL_SHARD_ID } from './sharding/sharding-utils';
import { getServerVersion } from './util/version';

export const DatabaseMode = {
  READER: 'reader',
  WRITER: 'writer',
} as const;
export type DatabaseMode = (typeof DatabaseMode)[keyof typeof DatabaseMode];

const globalPools: { pool: ShardPool | undefined; readonlyPool: ShardPool | undefined } = {
  pool: undefined,
  readonlyPool: undefined,
};
const shardPools: Record<string, { pool: ShardPool | undefined; readonlyPool: ShardPool | undefined }> = {};

export function getDatabasePool(mode: DatabaseMode, shardId: string): ShardPool {
  if (shardId.startsWith('TODO')) {
    console.warn(`getDatabasePool called with shardId ${shardId}`);
    shardId = GLOBAL_SHARD_ID;
  }

  const pools = shardId && shardId !== GLOBAL_SHARD_ID ? shardPools[shardId] : globalPools;

  if (!pools.pool) {
    throw new Error('Database not setup');
  }

  if (mode === DatabaseMode.READER && pools.readonlyPool) {
    return pools.readonlyPool;
  }

  return pools.pool;
}

export const locks = {
  migration: 1,
};

export async function initDatabase(serverConfig: MedplumServerConfig): Promise<void> {
  globalPools.pool = await initPool(GLOBAL_SHARD_ID, serverConfig.database, serverConfig.databaseProxyEndpoint);
  if (serverConfig.readonlyDatabase) {
    globalPools.readonlyPool = await initPool(
      GLOBAL_SHARD_ID,
      serverConfig.readonlyDatabase,
      serverConfig.readonlyDatabaseProxyEndpoint
    );
  }
  if (serverConfig.database.runMigrations !== false) {
    await runMigrations(globalPools.pool);
  }

  for (const [shardId, shardConfig] of Object.entries(serverConfig.shards ?? {})) {
    if (shardId === GLOBAL_SHARD_ID) {
      continue;
    }
    const shardPool = await initPool(shardId, shardConfig.database, undefined);
    const readonlyShardPool =
      shardConfig.readonlyDatabase && (await initPool(shardId, shardConfig.readonlyDatabase, undefined));

    shardPools[shardId] = {
      pool: shardPool,
      readonlyPool: readonlyShardPool,
    };

    if (shardConfig.database.runMigrations !== false) {
      await runMigrations(shardPool);
    }
  }
}

async function initPool(
  shardId: string,
  config: MedplumDatabaseConfig,
  proxyEndpoint: string | undefined
): Promise<ShardPool> {
  const poolConfig = {
    host: config.host,
    port: config.port,
    database: config.dbname,
    user: config.username,
    password: config.password,
    application_name: 'medplum-server',
    ssl: config.ssl,
    max: config.maxConnections ?? 100,
  };

  if (proxyEndpoint) {
    poolConfig.host = proxyEndpoint;
    poolConfig.ssl = poolConfig.ssl ?? {};
    poolConfig.ssl.require = true;
  }

  const pool = new DefaultShardPool(poolConfig, shardId);

  pool.on('error', (err) => {
    globalLogger.error('Database connection error', err);
  });

  if (!config.disableConnectionConfiguration) {
    pool.on('connect', (client) => {
      client.query(`SET statement_timeout TO ${config.queryTimeout ?? 60000}`).catch((err) => {
        globalLogger.warn('Failed to set query timeout', err);
      });
      client.query(`SET default_transaction_isolation TO 'REPEATABLE READ'`).catch((err) => {
        globalLogger.warn('Failed to set default transaction isolation', err);
      });
    });
  }

  return pool;
}

export function getDefaultStatementTimeout(config: MedplumDatabaseConfig): number | 'DEFAULT' {
  if (config.disableConnectionConfiguration) {
    return 'DEFAULT';
  }
  return config.queryTimeout ?? 60000;
}

export async function closeDatabase(): Promise<void> {
  for (const pools of [globalPools, ...Object.values(shardPools)]) {
    if (pools.pool) {
      globalLogger.info('Closing database pool', {
        shardId: pools.pool.shardId,
        totalCount: pools.pool.totalCount,
        idleCount: pools.pool.idleCount,
        waitingCount: pools.pool.waitingCount,
      });
      await pools.pool.end();
      pools.pool = undefined;
    }
    if (pools.readonlyPool) {
      globalLogger.info('Closing readonly database pool', {
        shardId: pools.readonlyPool.shardId,
        totalCount: pools.readonlyPool.totalCount,
        idleCount: pools.readonlyPool.idleCount,
        waitingCount: pools.readonlyPool.waitingCount,
      });
      await pools.readonlyPool.end();
      pools.readonlyPool = undefined;
    }
  }
}

async function runMigrations(pool: ShardPool): Promise<void> {
  let hasLock = false;
  await withPoolClient(async (client) => {
    try {
      hasLock = await acquireAdvisoryLock(client, locks.migration);
      if (!hasLock) {
        throw new Error('Failed to acquire migration lock');
      }
      await client.query(`SET statement_timeout TO 0`); // Disable timeout for migrations AFTER getting lock
      await migrate(client);
    } catch (err: any) {
      globalLogger.error('Database schema migration error', err);
      throw err;
    } finally {
      if (hasLock) {
        await releaseAdvisoryLock(client, locks.migration);
      }
    }
  }, pool);
}

export async function withPoolClient<TResult>(
  callback: (client: ShardPoolClient) => Promise<TResult>,
  pool: ShardPool
): Promise<TResult> {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release(true);
  }
}

type AcquireAdvisoryLockOptions = {
  maxAttempts?: number;
  retryDelayMs?: number;
};

export async function acquireAdvisoryLock(
  client: PoolClient,
  lockId: number,
  options?: AcquireAdvisoryLockOptions
): Promise<boolean> {
  const retryDelayMs = options?.retryDelayMs ?? 2000;
  const maxAttempts = options?.maxAttempts ?? 30;
  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts++;
    const result = await client.query<{ pg_try_advisory_lock: boolean }>('SELECT pg_try_advisory_lock($1)', [lockId]);
    if (result.rows[0].pg_try_advisory_lock) {
      return true;
    }
    if (attempts < maxAttempts) {
      await sleep(retryDelayMs);
    }
  }

  return false;
}

export async function releaseAdvisoryLock(client: PoolClient, lockId: number): Promise<void> {
  await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
}

async function migrate(client: ShardPoolClient): Promise<void> {
  await client.query(`CREATE TABLE IF NOT EXISTS "DatabaseMigration" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL,
    "dataVersion" INTEGER NOT NULL,
    "firstBoot" BOOLEAN NOT NULL DEFAULT false
  )`);

  let preDeployVersion = await getPreDeployVersion(client);

  // Initialize if this is the first time the server has been started up
  if (preDeployVersion === MigrationVersion.UNKNOWN) {
    await client.query(
      `INSERT INTO "DatabaseMigration" ("id", "version", "dataVersion", "firstBoot") VALUES (1, $1, $1, true)`,
      [MigrationVersion.NONE]
    );
    preDeployVersion = MigrationVersion.NONE;
  }

  await runAllPendingPreDeployMigrations(client, preDeployVersion);

  const postDeployVersion = await getPostDeployVersion(client);
  const pendingPostDeployMigration = await getPendingPostDeployMigration(client);
  if (postDeployVersion !== MigrationVersion.FIRST_BOOT && pendingPostDeployMigration !== MigrationVersion.NONE) {
    // Before migrating, check if we have pending data migrations to apply
    // We have to check these first since they depend on particular versions of the server code to be present in order
    // To ensure that the migration is applied before at a particular point in time before the version that requires it
    const versionEntry = getPostDeployManifestEntry(pendingPostDeployMigration);
    const serverVersion = getServerVersion();

    // We don't want to run the data migration until the specified version at least
    // We can just skip over this check if we are not on a version greater than or equal to the specified version

    // Broadly there are 3 cases
    // 1. Less than specified version (version < entry.serverVersion) - skip data migration prompt, allow startup of server
    // 2. Greater than or equal to the specified serverVersion and less than the requiredBefore version (entry.serverVersion <= version <= entry.requiredBefore) -- notify that a data migration is ready, allow startup
    // 3. Greater than or equal to the requiredBefore version (version >= entry.requiredBefore) -- throw from this function and do not allow server to startup
    if (semver.gte(serverVersion, versionEntry.serverVersion)) {
      // We allow any version where the data migration is greater than or equal to the specified `serverVersion` and it less than the `requiredBefore` version
      if (
        enforceStrictMigrationVersionChecks() &&
        versionEntry.requiredBefore &&
        semver.gte(serverVersion, versionEntry.requiredBefore)
      ) {
        throw new Error(
          `Unable to run this version of Medplum server. Pending post-deploy migration v${pendingPostDeployMigration} requires server at version ${versionEntry.serverVersion} <= version < ${versionEntry.requiredBefore}, but current server version is ${serverVersion}`
        );
      }
      // If we make it here, we have a pending migration, but we don't want to apply it until we make sure we apply all the schema migrations first
      globalLogger.info('Pending post-deploy migration', { version: `v${pendingPostDeployMigration}` });
    }
  }
}

async function runAllPendingPreDeployMigrations(client: ShardPoolClient, currentVersion: number): Promise<void> {
  for (let i = currentVersion + 1; i <= getPreDeployMigrationVersions().length; i++) {
    const migration = getPreDeployMigration(i);
    if (migration) {
      const start = Date.now();
      await migration.run(client);
      globalLogger.info('Database pre-deploy migration', {
        shardId: client.shardId,
        version: `v${i}`,
        duration: `${Date.now() - start} ms`,
      });
      await client.query('UPDATE "DatabaseMigration" SET "version"=$1 WHERE "id" = 1', [i]);
    }
  }
}

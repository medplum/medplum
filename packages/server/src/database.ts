import { badRequest, OperationOutcomeError, sleep, WithId } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool, PoolClient } from 'pg';
import * as semver from 'semver';
import { getConfig } from './config/loader';
import { MedplumDatabaseConfig, MedplumServerConfig } from './config/types';
import { getSystemRepo } from './fhir/repo';
import { globalLogger } from './logger';
import { getPostDeployVersion, getPreDeployVersion } from './migration-sql';
import {
  getPendingPostDeployMigration,
  getPreDeployMigration,
  queuePostDeployMigration,
} from './migrations/migration-utils';
import { getPreDeployMigrationVersions, MigrationVersion } from './migrations/migration-versions';
import { getServerVersion } from './util/version';

export const DatabaseMode = {
  READER: 'reader',
  WRITER: 'writer',
} as const;
export type DatabaseMode = (typeof DatabaseMode)[keyof typeof DatabaseMode];

let pool: Pool | undefined;
let readonlyPool: Pool | undefined;

export function getDatabasePool(mode: DatabaseMode): Pool {
  if (!pool) {
    throw new Error('Database not setup');
  }

  if (mode === DatabaseMode.READER && readonlyPool) {
    return readonlyPool;
  }

  return pool;
}

export const locks = {
  migration: 1,
};

export async function initDatabase(serverConfig: MedplumServerConfig): Promise<void> {
  pool = await initPool(serverConfig.database, serverConfig.databaseProxyEndpoint);

  if (serverConfig.database.runMigrations !== false) {
    await runMigrations(pool);
  }

  if (serverConfig.readonlyDatabase) {
    readonlyPool = await initPool(serverConfig.readonlyDatabase, serverConfig.readonlyDatabaseProxyEndpoint);
  }
}

async function initPool(config: MedplumDatabaseConfig, proxyEndpoint: string | undefined): Promise<Pool> {
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

  const pool = new Pool(poolConfig);

  pool.on('error', (err) => {
    globalLogger.error('Database connection error', err);
  });

  if (!config.disableConnectionConfiguration) {
    pool.on('connect', (client) => {
      client.query(`SET statement_timeout TO ${config.queryTimeout ?? DEFAULT_STATEMENT_TIMEOUT}`).catch((err) => {
        globalLogger.warn('Failed to set query timeout', err);
      });
      client.query(`SET default_transaction_isolation TO 'REPEATABLE READ'`).catch((err) => {
        globalLogger.warn('Failed to set default transaction isolation', err);
      });
    });
  }

  return pool;
}

const DEFAULT_STATEMENT_TIMEOUT = 60_000;

export function getDefaultStatementTimeout(config: MedplumDatabaseConfig): number | 'DEFAULT' {
  if (config.disableConnectionConfiguration) {
    return 'DEFAULT';
  }
  return config.queryTimeout ?? DEFAULT_STATEMENT_TIMEOUT;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }

  if (readonlyPool) {
    await readonlyPool.end();
    readonlyPool = undefined;
  }
}

async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  let hasLock = false;
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
    client.release(true); // Ensure migration connection is torn down and not re-used
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

async function migrate(client: PoolClient): Promise<void> {
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
    const manifest = JSON.parse(
      readFileSync(resolve(__dirname, 'migrations/data/data-version-manifest.json'), { encoding: 'utf-8' })
    ) as Record<string, { serverVersion: string; requiredBefore: string | undefined }>;
    const versionEntry = manifest['v' + pendingPostDeployMigration];

    const serverVersion = getServerVersion();

    // We don't want to run the data migration until the specified version at least
    // We can just skip over this check if we are not on a version greater than or equal to the specified version

    // Broadly there are 3 cases
    // 1. Less than specified version (version < entry.serverVersion) - skip data migration prompt, allow startup of server
    // 2. Greater than or equal to the specified serverVersion and less than the requiredBefore version (entry.serverVersion <= version <= entry.requiredBefore) -- notify that a data migration is ready, allow startup
    // 3. Greater than or equal to the requiredBefore version (version >= entry.requiredBefore) -- throw from this function and do not allow server to startup
    if (semver.gte(serverVersion, versionEntry.serverVersion)) {
      // We allow any version where the data migration is greater than or equal to the specified `serverVersion` and it less than the `requiredBefore` version
      if (versionEntry.requiredBefore && semver.gte(serverVersion, versionEntry.requiredBefore)) {
        throw new Error(
          `Unable to run this version of Medplum server. Pending post-deploy migration v${pendingPostDeployMigration} requires server at version ${versionEntry.serverVersion} <= version < ${versionEntry.requiredBefore}, but current server version is ${serverVersion}`
        );
      }
      // If we make it here, we have a pending migration, but we don't want to apply it until we make sure we apply all the schema migrations first
      globalLogger.info('Pending post-deploy migration', { version: `v${pendingPostDeployMigration}` });
    }
  }
}

async function runAllPendingPreDeployMigrations(client: PoolClient, currentVersion: number): Promise<void> {
  for (let i = currentVersion + 1; i <= getPreDeployMigrationVersions().length; i++) {
    const migration = getPreDeployMigration(i);
    if (migration) {
      const start = Date.now();
      await migration.run(client);
      globalLogger.info('Database pre-deploy migration', { version: `v${i}`, duration: `${Date.now() - start} ms` });
      await client.query('UPDATE "DatabaseMigration" SET "version"=$1 WHERE "id" = 1', [i]);
    }
  }
}

export async function maybeAutoRunPendingPostDeployMigration(): Promise<WithId<AsyncJob> | undefined> {
  const config = getConfig();
  const isDisabled = config.database.runMigrations === false || config.database.disableRunPostDeployMigrations;
  const pendingPostDeployMigration = await getPendingPostDeployMigration(getDatabasePool(DatabaseMode.WRITER));

  if (!isDisabled && pendingPostDeployMigration === MigrationVersion.UNKNOWN) {
    //throwing here seems extreme since it stops the server from starting
    // if this somehow managed to trigger, but arriving here would mean something
    // is pretty wrong, so throwing is probably the correct behavior?
    throw new Error('Cannot run post-deploy migrations; next post-deploy migration version is unknown');
  }

  if (pendingPostDeployMigration === MigrationVersion.NONE) {
    return undefined;
  }

  if (isDisabled) {
    globalLogger.info('Not auto-queueing pending post-deploy migration because auto-run is disabled', {
      version: `v${pendingPostDeployMigration}`,
    });
    return undefined;
  }

  const systemRepo = getSystemRepo();
  globalLogger.debug('Auto-queueing pending post-deploy migration', { version: `v${pendingPostDeployMigration}` });
  return queuePostDeployMigration(systemRepo, pendingPostDeployMigration);
}

/**
 * Attempts to queue the next pending post-deploy migration.
 *
 * If pending post-deploy migrations were not assessed due to `config.runMigrations` being false,
 * this function throws
 *
 * @param requestedDataVersion - The data version requested to run.
 * @returns An `AsyncJob` if migration is started or already running, otherwise returns `undefined` if no migration to run.
 */
export async function maybeStartPostDeployMigration(
  requestedDataVersion?: number
): Promise<WithId<AsyncJob> | undefined> {
  // If schema migrations didn't run, we should not attempt to run data migrations
  if (getConfig().database.runMigrations === false) {
    throw new OperationOutcomeError(
      badRequest('Cannot run post-deploy migration since pre-deploy migrations are disabled')
    );
  }

  const pool = getDatabasePool(DatabaseMode.WRITER);
  const pendingPostDeployMigration = await getPendingPostDeployMigration(pool);
  // This should never happen unless there is something wrong with the state of the database but technically possible
  if (pendingPostDeployMigration === MigrationVersion.UNKNOWN) {
    throw new OperationOutcomeError(
      badRequest('Cannot run post-deploy migration since post-deploy version is unknown')
    );
  }

  // If a version has been asserted, check if we have that version pending
  // Or if we have already applied it
  if (requestedDataVersion) {
    if (requestedDataVersion <= 0) {
      throw new OperationOutcomeError(badRequest('post-deploy migration number must be greater than zero.'));
    }

    const postDeployVersion = await getPostDeployVersion(pool, { ignoreFirstBoot: true });
    // We have already applied this data version, there is no migration to run
    if (requestedDataVersion <= postDeployVersion) {
      return undefined;
    }

    if (requestedDataVersion > pendingPostDeployMigration) {
      // The post-deploy version is higher than the version we expect to apply next, we cannot apply this migration
      // This is also true when pending migration is NONE
      const endOfMessage =
        pendingPostDeployMigration === MigrationVersion.NONE
          ? 'there are no pending post-deploy migrations'
          : `the pending post-deploy migration is v${pendingPostDeployMigration}`;
      throw new OperationOutcomeError(
        badRequest(`Requested post-deploy migration v${requestedDataVersion}, but ${endOfMessage}.`)
      );
    }
  }

  if (pendingPostDeployMigration === MigrationVersion.NONE) {
    return undefined;
  }

  const systemRepo = getSystemRepo();
  return queuePostDeployMigration(systemRepo, pendingPostDeployMigration);
}

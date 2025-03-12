import {
  badRequest,
  getReferenceString,
  OperationOutcomeError,
  parseSearchRequest,
  sleep,
  WithId,
} from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool, PoolClient } from 'pg';
import * as semver from 'semver';
import { getConfig } from './config/loader';
import { MedplumDatabaseConfig, MedplumServerConfig } from './config/types';
import { getSystemRepo } from './fhir/repo';
import { globalLogger } from './logger';
import {
  createAsyncJobForPostDeployMigration,
  getPostDeployMigration,
  getPostDeployMigrationVersions,
  getPreDeployMigration,
  getPreDeployMigrationVersions,
} from './migrations/migration-utils';
import { getServerVersion } from './util/version';

export enum DatabaseMode {
  READER = 'reader',
  WRITER = 'writer',
}

const Version = {
  UNKNOWN: -1,
  NONE: 0,
} as const;

let pool: Pool | undefined;
let readonlyPool: Pool | undefined;
let isFirstServerStart = false;

async function getPreDeployVersion(): Promise<number> {
  // This generic type is not technically correct, but leads to the desired forced checks for undefined `version` and `dataVersion`
  // Technically pg should infer that rows could have zero length, but adding optionality to all fields forces handling the undefined case when the row is empty
  const result = await getDatabasePool(DatabaseMode.WRITER).query<{ version?: number }>(
    'SELECT "version" FROM "DatabaseMigration";'
  );
  return result.rows[0]?.version ?? Version.UNKNOWN;
}

export async function getPostDeployVersion(): Promise<number> {
  const result = await getDatabasePool(DatabaseMode.WRITER).query<{ dataVersion?: number }>(
    'SELECT "dataVersion" FROM "DatabaseMigration";'
  );
  return result.rows[0]?.dataVersion ?? Version.UNKNOWN;
}

/**
 * Gets the next post-deploy migration that needs to be run.
 * Returns `Version.NONE` if there are no pending migrations, or `Version.UNKNOWN`
 * if the current post-deploy version (and therefore, the pending data migration) cannot
 * be assessed.
 *
 * @returns The next post-deploy migration version (if any) that should be run.
 */
export async function getPendingPostDeployMigration(): Promise<number> {
  const postDeployVersion = await getPostDeployVersion();
  if (postDeployVersion === Version.UNKNOWN) {
    return postDeployVersion;
  }

  const allPostDeployVersions = getPostDeployMigrationVersions();
  if (allPostDeployVersions.includes(postDeployVersion + 1)) {
    return postDeployVersion + 1;
  }

  return Version.NONE;
}

export async function markPendingDataMigrationCompleted(job: AsyncJob): Promise<void> {
  assert(job.dataVersion);
  let duration = -1;
  try {
    if (job.transactionTime && job.requestTime) {
      duration = (new Date(job.transactionTime).getTime() - new Date(job.requestTime).getTime()) / 1000;
    }
  } catch (err) {
    globalLogger.error('Error computing duration of post-deploy migration', { error: err });
  }

  globalLogger.info('post-deploy migration completed', {
    version: 'v' + job.dataVersion,
    duration: duration !== -1 ? duration : 'unknown',
  });
  await getDatabasePool(DatabaseMode.WRITER).query('UPDATE "DatabaseMigration" SET "dataVersion" = $1', [
    job.dataVersion,
  ]);
}

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

/**
 * Sets up the database migration schema and runs pending pre-deploy migrations.
 * NOTE: This function assumes it has acquired the exclusive lock for migration operations.
 * @param client - The database client.
 * @returns A promise that resolves when initialization and pre-deploy migrations have run.
 */
async function migrate(client: PoolClient): Promise<void> {
  await client.query(`CREATE TABLE IF NOT EXISTS "DatabaseMigration" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL,
    "dataVersion" INTEGER NOT NULL
  )`);

  const preDeployVersion = await getPreDeployVersion();

  // If this is the first time the server has been started up (version === DataVersion.UNKNOWN),
  // initialize the migrations table
  if (preDeployVersion === Version.UNKNOWN) {
    await client.query(`INSERT INTO "DatabaseMigration" ("id", "version", "dataVersion") VALUES (1, 0, 0)`);
    await runAllPendingPreDeployMigrations(client, Version.NONE);

    // Using a global module variable to track this feels gross,
    // but returning a boolean from `migrate()` and having to bubble it up and back down
    // several function calls seems even worse.
    isFirstServerStart = true;
    return;
  }

  const pendingPostDeployMigration = await getPendingPostDeployMigration();
  if (preDeployVersion && pendingPostDeployMigration > 0) {
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
          `Unable to run post-deploy migration v${pendingPostDeployMigration} on this server. v${pendingPostDeployMigration} requires server at version ${versionEntry.serverVersion} <= version < ${versionEntry.requiredBefore}, but current server version is ${serverVersion}`
        );
      }
      // If we make it here, we have a pending migration, but we don't want to apply it until we make sure we apply all the schema migrations first
      globalLogger.info('Data migration ready to run', { dataVersion: pendingPostDeployMigration });
    }
  }

  await runAllPendingPreDeployMigrations(client, preDeployVersion);
}

async function runAllPendingPreDeployMigrations(client: PoolClient, currentVersion: number): Promise<void> {
  for (let i = currentVersion + 1; i <= getPreDeployMigrationVersions().length; i++) {
    const migration = getPreDeployMigration(i);
    if (migration) {
      const start = Date.now();
      await migration.run(client);
      globalLogger.info('Database pre-deploy migration', { version: `v${i}`, duration: `${Date.now() - start} ms` });
      await client.query('UPDATE "DatabaseMigration" SET "version"=$1', [i]);
    }
  }
}

export async function queueAllPendingPostDeployMigrations(): Promise<void> {
  const pendingPostDeployMigration = await getPendingPostDeployMigration();
  if (pendingPostDeployMigration === Version.UNKNOWN) {
    //TODO{mattlong} - throwing here feels wrong since it'd stop the server from starting
    // up if this somehow managed to trigger, but it would mean something is pretty
    // wrong, so maybe throwing is the correct behavior?
    throw new Error('Cannot run post-deploy migrations; post-deploy version is unknown');
  }

  if (pendingPostDeployMigration === Version.NONE) {
    return;
  }

  const systemRepo = getSystemRepo();
  for (let i = pendingPostDeployMigration; i <= getPostDeployMigrationVersions().length; i++) {
    const migration = getPostDeployMigration(i);
    /*
     TODO{mattlong} - should somehow check for existing AsyncJob. This gets at the bigger
     open question of what exactly is the relationship between the AsyncJobs and the BullMQ jobs?
     which is the source of truth?
     
     e.g., should there only ever be one AsyncJob referencing post-deploy migration v2?
    */
    const asyncJob = await createAsyncJobForPostDeployMigration(systemRepo, i);
    globalLogger.info('Queueing post-deploy migration', {
      version: `v${i}`,
      asyncJob: getReferenceString(asyncJob),
      isFirstServerStart,
    });
    await migration.run(systemRepo, asyncJob, isFirstServerStart);
  }
}

/**
 * Attempts to queue the next pending post-deploy migration.
 *
 * If pending post-deploy migrations were not assessed due to `config.runMigrations` being false,
 * this function throws
 *
 * @param assertedDataVersion - The asserted data version that we expect to run.
 * @returns An `AsyncJob` if migration is started or already running, otherwise returns `undefined` if no migration to run.
 */
export async function maybeStartPostDeployMigration(
  assertedDataVersion?: number
): Promise<WithId<AsyncJob> | undefined> {
  // If schema migrations didn't run, we should not attempt to run data migrations
  if (getConfig().database.runMigrations === false) {
    throw new OperationOutcomeError(
      badRequest('Cannot run post-deploy migration since pre-deploy migrations did not run')
    );
  }

  const pendingPostDeployMigration = await getPendingPostDeployMigration();
  // This should never happen unless there is something wrong with the state of the database but technically possible
  if (pendingPostDeployMigration === Version.UNKNOWN) {
    throw new OperationOutcomeError(
      badRequest('Cannot run post-deploy migration since post-deploy version is unknown')
    );
  }

  // If a version has been asserted, check if we have that version pending
  // Or if we have already applied it
  if (assertedDataVersion) {
    const postDeployVersion = await getPostDeployVersion();
    // We have already applied this data version, there is no migration to run
    if (assertedDataVersion <= postDeployVersion) {
      return undefined;
    }
    // The post-deploy version is higher than the version we expect to apply next, we cannot apply this migration
    // This is also true when pending migration is NONE
    if (assertedDataVersion > pendingPostDeployMigration) {
      throw new OperationOutcomeError(
        badRequest(
          `Post-deploy migration assertion failed. Expected pending migration to be migration ${assertedDataVersion}, server has ${pendingPostDeployMigration > 0 ? `current pending post-deploy migration ${pendingPostDeployMigration}` : 'no pending post-deploy migration'}`
        )
      );
    }
  } else if (pendingPostDeployMigration === Version.NONE) {
    // If there is no asserted version, and no pending migration to run, then we can no-op
    return undefined;
  }

  const systemRepo = getSystemRepo();
  let postDeployMigrationJob: WithId<AsyncJob> | undefined;

  await systemRepo.withTransaction(
    async () => {
      // Check if there is already a migration job in progress
      const existingJobs = await systemRepo.searchResources<AsyncJob>(
        parseSearchRequest('AsyncJob?status=accepted&type=data-migration&_count=2')
      );
      // If there is more than one existing job, we should throw
      if (existingJobs.length > 1) {
        throw new OperationOutcomeError(
          badRequest(
            'Data migration unable to start due to more than one existing data-migration AsyncJob with accepted status'
          )
        );
      }
      const existingJob = existingJobs[0];
      // If there is an existing job and it has any compartments, we should always throw (someone has created a data-migration job in their project)
      if (existingJob?.meta?.compartment) {
        throw new OperationOutcomeError(
          badRequest(
            'Data migration unable to start due to existing data-migration AsyncJob with accepted status in a project'
          )
        );
      }
      if (existingJob) {
        postDeployMigrationJob = existingJob;
        return;
      }
      // If there isn't an existing job, create a new one and start data migration
      postDeployMigrationJob = await createAsyncJobForPostDeployMigration(systemRepo, pendingPostDeployMigration);

      const migration = getPostDeployMigration(pendingPostDeployMigration);
      // Don't await the migration, since it could be blocking
      migration
        // We get a new system repo here so that we are not reusing with the system repo doing the transaction
        .run(getSystemRepo(), postDeployMigrationJob, false)
        .catch((err) => globalLogger.error('Error while running data migration', { err }));
    },
    { serializable: true }
  );

  return postDeployMigrationJob;
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, getReferenceString, OperationOutcomeError, parseSearchRequest, WithId } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, PoolClient } from 'pg';
import { getConfig } from '../config/loader';
import { DatabaseMode, getDatabasePool } from '../database';
import { getSystemRepo, Repository } from '../fhir/repo';
import { globalLogger } from '../logger';
import { getPostDeployVersion } from '../migration-sql';
import { getServerVersion } from '../util/version';
import { addPostDeployMigrationJobData } from '../workers/post-deploy-migration';
import { InProgressAsyncJobStatuses } from '../workers/utils';
import * as postDeployMigrations from './data';
import { PostDeployMigration } from './data/types';
import { getPostDeployMigrationVersions, MigrationVersion } from './migration-versions';
import * as preDeployMigrations from './schema';
import { PreDeployMigration } from './schema/types';

/**
 * Gets the next post-deploy migration that needs to be run.
 * Returns `MigrationVersion.NONE` if there are no pending migrations, or `MigrationVersion.UNKNOWN`
 * if the current post-deploy version (and therefore, the pending data migration) cannot
 * be assessed.
 * @param client - The database client to use for reading the current post-deploy version.
 * @returns The next post-deploy migration version (if any) that should be run, or `MigrationVersion.NONE`
 * if there are no pending migrations, or `MigrationVersion.UNKNOWN` if the current post-deploy version
 * cannot be assessed.
 */
export async function getPendingPostDeployMigration(client: Pool | PoolClient): Promise<number> {
  const postDeployVersion = await getPostDeployVersion(client, { ignoreFirstBoot: true });

  if (postDeployVersion === MigrationVersion.UNKNOWN) {
    return postDeployVersion;
  }

  const allPostDeployVersions = getPostDeployMigrationVersions();
  if (allPostDeployVersions.includes(postDeployVersion + 1)) {
    return postDeployVersion + 1;
  }

  return MigrationVersion.NONE;
}

export function getPreDeployMigration(migrationNumber: number): PreDeployMigration {
  // Get the pre-deploy migration from the pre-deploy migrations module
  const migration = (preDeployMigrations as Record<string, PreDeployMigration>)['v' + migrationNumber];
  if (!migration) {
    throw new Error(`Pre-deploy migration definition not found for v${migrationNumber}`);
  }

  // Ensure that the migration defines the necessary interface
  if (!('run' in migration) || typeof migration.run !== 'function') {
    throw new Error(`run function not defined for pre-deploy migration v${migrationNumber}`);
  }

  return migration as PreDeployMigration;
}

export class MigrationDefinitionNotFoundError extends Error {
  constructor(migrationNumber: number) {
    super(`Migration definition not found for v${migrationNumber}`);
  }
}

export function getPostDeployMigration(migrationNumber: number): PostDeployMigration {
  // Get the post-deploy migration from the post-deploy migrations module
  const migration = (postDeployMigrations as Record<string, { migration: PostDeployMigration } | undefined>)[
    'v' + migrationNumber
  ]?.migration;
  if (!migration) {
    throw new MigrationDefinitionNotFoundError(migrationNumber);
  }

  if (!('type' in migration)) {
    throw new Error(`type not defined for migration v${migrationNumber}`);
  }

  return migration;
}

export function getPostDeployManifestEntry(migrationNumber: number): {
  serverVersion: string;
  requiredBefore: string | undefined;
} {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const manifest = JSON.parse(
    readFileSync(resolve(__dirname, 'data/data-version-manifest.json'), { encoding: 'utf-8' })
  ) as Record<string, { serverVersion: string; requiredBefore: string | undefined }>;
  return manifest['v' + migrationNumber];
}

export async function upsertPostDeployMigrationAsyncJob(
  repo: Repository,
  migrationNumber: number,
  existingAsyncJob?: WithId<AsyncJob>
): Promise<WithId<AsyncJob>> {
  const toSave: AsyncJob = {
    resourceType: 'AsyncJob',
    type: 'data-migration',
    status: 'accepted',
    request: `data-migration-v${migrationNumber}`,
    dataVersion: migrationNumber,
    output: undefined,
    requestTime: existingAsyncJob?.requestTime ?? new Date().toISOString(),
    // We know that because we were able to start the migration on this server instance,
    // That we must be on the right version to run this migration
    minServerVersion: existingAsyncJob?.minServerVersion ?? getServerVersion(),
    id: existingAsyncJob?.id,
  };

  if (toSave.id) {
    return repo.updateResource(toSave);
  }

  return repo.createResource(toSave);
}

export function enforceStrictMigrationVersionChecks(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.MEDPLUM_ENABLE_STRICT_MIGRATION_VERSION_CHECKS);
}

export async function preparePostDeployMigrationAsyncJob(
  systemRepo: Repository,
  version: number
): Promise<WithId<AsyncJob>> {
  return systemRepo.withTransaction(
    async () => {
      // Check if there is already a migration job in progress
      const existingJobs = await systemRepo.searchResources<AsyncJob>(
        parseSearchRequest(
          `AsyncJob?status=${InProgressAsyncJobStatuses.join(',')}&type=data-migration&_count=2&_project:missing=true`
        )
      );

      // If there is more than one existing job, we should throw
      if (existingJobs.length > 1) {
        throw new OperationOutcomeError(
          badRequest(
            'Unable to start post-deploy migration since there are more than one existing data-migration AsyncJob with accepted status'
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
      const asyncJob = await upsertPostDeployMigrationAsyncJob(systemRepo, version, existingJob);

      return asyncJob;
    },
    { serializable: true }
  );
}

export async function queuePostDeployMigration(systemRepo: Repository, version: number): Promise<WithId<AsyncJob>> {
  const migration = getPostDeployMigration(version);
  const asyncJob = await preparePostDeployMigrationAsyncJob(systemRepo, version);

  // Previously, queueing the bullMQ job was done in the transaction above,
  // but that could lead to race conditions if the queued job happened to be
  // picked up before the transaction was committed.
  // globalLogger.info('Adding post-deploy migration job', { version, asyncJob: getReferenceString(asyncJob) });
  const jobData = migration.prepareJobData(asyncJob);
  const result = await addPostDeployMigrationJobData(jobData);
  if (!result) {
    globalLogger.error('Unable to add post-deploy migration job', {
      version,
      asyncJob: getReferenceString(asyncJob),
    });
  }

  return asyncJob;
}

export async function withLongRunningDatabaseClient<TResult>(
  callback: (client: PoolClient) => Promise<TResult>,
  databaseMode?: DatabaseMode
): Promise<TResult> {
  const pool = getDatabasePool(databaseMode ?? DatabaseMode.WRITER);
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout TO 0`);
    return await callback(client);
  } finally {
    client.release(true);
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

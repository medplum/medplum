import { badRequest, getReferenceString, OperationOutcomeError, parseSearchRequest, WithId } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { Repository } from '../fhir/repo';
import { globalLogger } from '../logger';
import { getServerVersion } from '../util/version';
import { addPostDeployMigrationJobData } from '../workers/post-deploy-migration';
import { InProgressAsyncJobStatuses } from '../workers/utils';
import * as postDeployMigrations from './data';
import { PostDeployMigration } from './data/types';
import * as preDeploymigrations from './schema';
import { PreDeployMigration } from './schema/types';
import { getPostDeployVersion } from '../migration-sql';
import { Pool, PoolClient } from 'pg';
import { getPostDeployMigrationVersions, MigrationVersion } from './migration-versions';

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
  const migration = (preDeploymigrations as Record<string, PreDeployMigration>)['v' + migrationNumber];
  if (!migration) {
    throw new Error(`Pre-deploy migration definition not found for v${migrationNumber}`);
  }

  // Ensure that the migration defines the necessary interface
  if (!('run' in migration) || typeof migration.run !== 'function') {
    throw new Error(`run function not defined for pre-deploy migration v${migrationNumber}`);
  }

  return migration as PreDeployMigration;
}

export function getPostDeployMigration(migrationNumber: number): PostDeployMigration {
  // Get the post-deploy migration from the post-deploy migrations module
  const migration = (postDeployMigrations as Record<string, { migration: PostDeployMigration }>)['v' + migrationNumber]
    .migration;
  if (!migration) {
    throw new Error(`Migration definition not found for v${migrationNumber}`);
  }

  if (!('type' in migration)) {
    throw new Error(`type not defined for migration v${migrationNumber}`);
  }

  return migration;
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

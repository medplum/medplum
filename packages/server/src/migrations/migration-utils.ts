import { WithId } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { Repository } from '../fhir/repo';
import { getServerVersion } from '../util/version';
import * as preDeploymigrations from './schema';
import * as postDeployMigrations from './data';
import { PostDeployMigration, CustomPostDeployMigration, ReindexPostDeployMigration } from './data/types';
import { PreDeployMigration } from './schema/types';

/**
 * Gets a sorted array of all migration versions for the passed in migration module.
 *
 * Can be used for either the schema or data migrations modules.
 *
 * @param migrationModule - The migration module to read all migrations for. Either the schemaMigrations or dataMigrations module.
 * @returns All the numeric migration versions from a given migration module, either the schema or data migrations.
 */
function getMigrationVersions(migrationModule: Record<string, any>): number[] {
  const prefixedVersions = Object.keys(migrationModule).filter((key) => key.startsWith('v'));
  const migrationVersions = prefixedVersions.map((key) => Number.parseInt(key.slice(1), 10)).sort((a, b) => a - b);
  return migrationVersions;
}

/**
 * Gets a sorted array of all pre-deploy migration versions.
 *
 * @returns Sorted array of pre-deploy migration versions.
 */
export function getPreDeployMigrationVersions(): number[] {
  return getMigrationVersions(preDeploymigrations);
}

/**
 * Gets a sorted array of all post-deploy migration versions.
 *
 * @returns Sorted array of post-deploy migration versions.
 */
export function getPostDeployMigrationVersions(): number[] {
  return getMigrationVersions(postDeployMigrations);
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

export function getPostDeployMigration(
  migrationNumber: number
): CustomPostDeployMigration | ReindexPostDeployMigration {
  // Get the post-deploy migration from the post-deploy migrations module
  const migration = (postDeployMigrations as Record<string, { default: PostDeployMigration }>)['v' + migrationNumber]
    .default;
  if (!migration) {
    throw new Error(`Migration definition not found for v${migrationNumber}`);
  }

  if (!('type' in migration)) {
    throw new Error(`type not defined for migration v${migrationNumber}`);
  }

  if (migration.type === 'reindex') {
    return migration as ReindexPostDeployMigration;
  }

  // Ensure that the migration defines the necessary interface
  if (migration.type === 'custom') {
    if (!('process' in migration) || typeof migration.process !== 'function') {
      throw new Error(`process function not defined for migration v${migrationNumber}`);
    }
    return migration as CustomPostDeployMigration;
  }

  throw new Error(`Unknown migration type: ${migration.type}`);
}

export async function createAsyncJobForPostDeployMigration(
  repo: Repository,
  migrationNumber: number
): Promise<WithId<AsyncJob>> {
  return repo.createResource({
    resourceType: 'AsyncJob',
    type: 'data-migration',
    status: 'accepted',
    request: `data-migration-v${migrationNumber}`,
    requestTime: new Date().toISOString(),
    dataVersion: migrationNumber,
    // We know that because we were able to start the migration on this server instance,
    // That we must be on the right version to run this migration
    minServerVersion: getServerVersion(),
  });
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { ClientApplication, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import { bcryptHashPassword, createProfile, createProjectMembership } from './auth/utils';
import type { MedplumServerConfig } from './config/types';
import { r4ProjectId } from './constants';
import { DatabaseMode, getDatabasePool, withPoolClient } from './database';
import { createProjectResource } from './fhir/operations/projectinit';
import type { SystemRepository } from './fhir/repo';
import { getShardSystemRepo } from './fhir/repo';
import { GLOBAL_SHARD_ID } from './fhir/sharding';
import { globalLogger } from './logger';
import { rebuildR4SearchParameters } from './seeds/searchparameters';
import { rebuildR4StructureDefinitions } from './seeds/structuredefinitions';
import { rebuildR4ValueSets } from './seeds/valuesets';
import type { ShardPool } from './sharding/sharding-types';
import { setProjectShard } from './sharding/sharding-utils';

export async function seedDatabase(config: MedplumServerConfig): Promise<void> {
  // Ensure global shard is run first
  const globalPool = getDatabasePool(DatabaseMode.WRITER, GLOBAL_SHARD_ID);
  await seedDatabaseShard(globalPool, config);

  // Seed all other shards
  if (config.shards) {
    for (const shardName of Object.keys(config.shards)) {
      // SHARDING - global shard will be removed from the config.shards object
      if (shardName === GLOBAL_SHARD_ID) {
        continue;
      }
      const pool = getDatabasePool(DatabaseMode.WRITER, shardName);
      await seedDatabaseShard(pool, config);
    }
  }
}

export async function seedDatabaseShard(pool: ShardPool, config: MedplumServerConfig): Promise<void> {
  await withPoolClient(async (client) => {
    const systemRepo = getShardSystemRepo(client.shardId, client, {
      skipBackgroundJobs: true,
    });

    if (await isSeeded(systemRepo)) {
      globalLogger.info('Already seeded', { shardId: pool.shardId });
      return;
    }

    await systemRepo.withTransaction(async () => {
      const r4Project = await systemRepo.readResource<Project>('Project', r4ProjectId);
      setProjectShard(pool.shardId, r4Project);
      await systemRepo.updateResource<Project>(r4Project);

      await createSuperAdmin(systemRepo, config);

      globalLogger.info('Building structure definitions...', { shardId: pool.shardId });
      let startTime = Date.now();
      await rebuildR4StructureDefinitions(systemRepo);
      globalLogger.info('Finished building structure definitions', {
        shardId: pool.shardId,
        durationMs: Date.now() - startTime,
      });

      globalLogger.info('Building value sets...', { shardId: pool.shardId });
      startTime = Date.now();
      await rebuildR4ValueSets(systemRepo);
      globalLogger.info('Finished building value sets', { shardId: pool.shardId, durationMs: Date.now() - startTime });

      globalLogger.info('Building search parameters...', { shardId: pool.shardId });
      startTime = Date.now();
      await rebuildR4SearchParameters(systemRepo);
      globalLogger.info('Finished building search parameters', {
        shardId: pool.shardId,
        durationMs: Date.now() - startTime,
      });
    });
  }, pool);
}

async function createSuperAdmin(systemRepo: SystemRepository, config: MedplumServerConfig): Promise<void> {
  const email = config.defaultSuperAdminEmail ?? 'admin@example.com';
  const password = config.defaultSuperAdminPassword ?? 'medplum_admin';
  const [firstName, lastName] = ['Medplum', 'Admin'];
  const passwordHash = await bcryptHashPassword(password);
  const superAdmin = await systemRepo.createResource<User>({
    resourceType: 'User',
    firstName,
    lastName,
    email,
    passwordHash,
  });

  const { project: superAdminProject } = await createProjectResource(systemRepo, {
    resourceType: 'Project',
    name: 'Super Admin',
    owner: createReference(superAdmin),
    superAdmin: true,
    strictMode: true,
  });

  const practitioner = await createProfile(systemRepo, superAdminProject, 'Practitioner', firstName, lastName, email);
  await createProjectMembership(systemRepo, superAdmin, superAdminProject, practitioner, { admin: true });

  if (config.defaultSuperAdminClientId && config.defaultSuperAdminClientSecret) {
    // Use specified client ID and secret
    const client = await systemRepo.updateResource<ClientApplication>({
      meta: {
        project: superAdminProject.id,
      },
      resourceType: 'ClientApplication',
      id: config.defaultSuperAdminClientId,
      name: 'Default Super Admin Client',
      secret: config.defaultSuperAdminClientSecret,
    });

    await systemRepo.createResource<ProjectMembership>({
      meta: {
        project: superAdminProject.id,
      },
      resourceType: 'ProjectMembership',
      project: createReference(superAdminProject),
      user: createReference(client),
      profile: createReference(client),
    });
  }
}

/**
 * Returns true if the database is already seeded.
 * @param systemRepo - The system repository to use to check if the database is seeded.
 * @returns True if already seeded.
 */
function isSeeded(systemRepo: SystemRepository): Promise<User | undefined> {
  return systemRepo.searchOne({ resourceType: 'User' });
}

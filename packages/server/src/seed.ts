// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { ClientApplication, Practitioner, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import { bcryptHashPassword } from './auth/utils';
import type { MedplumServerConfig } from './config/types';
import { r4ProjectId } from './constants';
import { DatabaseMode, getDatabasePool } from './database';
import type { Repository } from './fhir/repo';
import { getSystemRepo } from './fhir/repo';
import { globalLogger } from './logger';
import { rebuildR4SearchParameters } from './seeds/searchparameters';
import { rebuildR4StructureDefinitions } from './seeds/structuredefinitions';
import { rebuildR4ValueSets } from './seeds/valuesets';
import type { ShardPool } from './sharding';

export async function seedDatabase(config: MedplumServerConfig): Promise<void> {
  // Ensure 'global' shard is run first
  const globalPool = getDatabasePool(DatabaseMode.WRITER, 'global');
  await seedDatabaseShard(globalPool, config);

  // Seed all other shards
  if (config.shards) {
    for (const shardName of Object.keys(config.shards)) {
      if (shardName === 'global') {
        continue;
      }
      const pool = getDatabasePool(DatabaseMode.WRITER, shardName);
      await seedDatabaseShard(pool, config);
    }
  }
}

export async function seedDatabaseShard(pool: ShardPool, config: MedplumServerConfig): Promise<void> {
  const conn = await pool.connect();
  const systemRepo = getSystemRepo(conn);

  if (await isSeeded(systemRepo)) {
    globalLogger.info('Already seeded', { shardId: pool.shardId });
    return;
  }

  await systemRepo.withTransaction(async () => {
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
}

async function createSuperAdmin(systemRepo: Repository, config: MedplumServerConfig): Promise<void> {
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

  const superAdminProject = await systemRepo.createResource<Project>({
    resourceType: 'Project',
    name: 'Super Admin',
    owner: createReference(superAdmin),
    superAdmin: true,
    strictMode: true,
  });

  await systemRepo.updateResource<Project>({
    resourceType: 'Project',
    id: r4ProjectId,
    name: 'FHIR R4',
  });

  const practitioner = await systemRepo.createResource<Practitioner>({
    resourceType: 'Practitioner',
    meta: {
      project: superAdminProject.id,
    },
    name: [
      {
        given: [firstName],
        family: lastName,
      },
    ],
    telecom: [
      {
        system: 'email',
        use: 'work',
        value: email,
      },
    ],
  });

  await systemRepo.createResource<ProjectMembership>({
    resourceType: 'ProjectMembership',
    project: createReference(superAdminProject),
    user: createReference(superAdmin),
    profile: createReference(practitioner),
    admin: true,
  });

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
function isSeeded(systemRepo: Repository): Promise<Project | undefined> {
  //TODO{sharding} - replace this with some well known table that is set after seeding so it doesn't potentially
  // relay on the global shard or a super admin NOT having taken some action like deleting all projects; which is
  // weird to think about but technically possible?
  return systemRepo.searchOne({
    resourceType: 'Project',
    filters: [{ code: 'name', operator: 'exact', value: 'Super Admin' }],
  });
}

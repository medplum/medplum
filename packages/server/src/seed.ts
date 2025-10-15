// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { Practitioner, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import { bcryptHashPassword } from './auth/utils';
import { getConfig } from './config/loader';
import { r4ProjectId } from './constants';
import { DatabaseMode, getDatabasePool } from './database';
import type { Repository } from './fhir/repo';
import { getSystemRepo } from './fhir/repo';
import { globalLogger } from './logger';
import { rebuildR4SearchParameters } from './seeds/searchparameters';
import { rebuildR4StructureDefinitions } from './seeds/structuredefinitions';
import { rebuildR4ValueSets } from './seeds/valuesets';
import type { ShardPool } from './shard-pool';

export async function seedDatabase(): Promise<void> {
  // Ensure 'global' shard is run first
  const globalPool = getDatabasePool(DatabaseMode.WRITER, 'global');
  await seedDatabaseShard(globalPool);

  // Seed all other shards
  for (const shardName of Object.keys(getConfig().shards)) {
    if (shardName === 'global') {
      continue;
    }
    const pool = getDatabasePool(DatabaseMode.WRITER, shardName);
    await seedDatabaseShard(pool);
  }
}

export async function seedDatabaseShard(pool: ShardPool): Promise<void> {
  const conn = await pool.connect();
  const systemRepo = getSystemRepo(conn);

  if (await isSeeded(systemRepo)) {
    globalLogger.info('Already seeded', { shardId: pool.shardId });
    return;
  }

  await systemRepo.withTransaction(async () => {
    await createSuperAdmin(systemRepo);

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

async function createSuperAdmin(systemRepo: Repository): Promise<void> {
  const [firstName, lastName, email] = ['Medplum', 'Admin', 'admin@example.com'];
  const passwordHash = await bcryptHashPassword('medplum_admin');
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
}

/**
 * Returns true if the database is already seeded.
 * @param systemRepo - The system repository to use to check if the database is seeded.
 * @returns True if already seeded.
 */
function isSeeded(systemRepo: Repository): Promise<User | undefined> {
  return systemRepo.searchOne({ resourceType: 'User' });
}

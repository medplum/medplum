// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, parseSearchRequest } from '@medplum/core';
import type { ClientApplication, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import { bcryptHashPassword, createProfile, createProjectMembership } from './auth/utils';
import type { ServerConfig } from './config/utils';
import { r4ProjectId } from './constants';
import type { SystemRepository } from './fhir/repo';
import { getShardSystemRepo } from './fhir/repo';
import { GLOBAL_SHARD_ID } from './fhir/sharding';
import { globalLogger } from './logger';
import { rebuildR4SearchParameters } from './seeds/searchparameters';
import { rebuildR4StructureDefinitions } from './seeds/structuredefinitions';
import { rebuildR4ValueSets } from './seeds/valuesets';

/**
 * Seed the database including all shards
 *
 * On the global shard:
 * 1. Create R4 project
 * 2. Rebuild structure definitions, value sets, and search parameters
 * 3. Create super admin user, project, practitioner, projectmembership, clientapplication
 *
 * On each additional shard, if any:
 * 2. Rebuild structure definitions, value sets, and search parameters
 */

export async function seedDatabase(config: ServerConfig): Promise<void> {
  const globalShardRepo = getShardSystemRepo(GLOBAL_SHARD_ID, undefined, { skipBackgroundJobs: true });

  if (await globalShardRepo.searchOne({ resourceType: 'Practitioner' })) {
    globalLogger.info('Already seeded', { shardId: GLOBAL_SHARD_ID });
  } else {
    await createR4Project(globalShardRepo);

    await seedBaseDefinitions(globalShardRepo);

    await createSuperAdmin(globalShardRepo, config);
  }

  if (config.shards) {
    for (const [shardId] of Object.entries(config.shards)) {
      const shardSystemRepo = getShardSystemRepo(shardId, undefined, { skipBackgroundJobs: true });
      if (!(await shardSystemRepo.searchOne({ resourceType: 'StructureDefinition' }))) {
        await seedBaseDefinitions(shardSystemRepo);
      }
    }
  }
}

async function createR4Project(systemRepo: SystemRepository): Promise<WithId<Project>> {
  let r4Project = await systemRepo.searchOne<Project>(parseSearchRequest(`Project?_id=${r4ProjectId}`));
  if (!r4Project) {
    r4Project = await systemRepo.createResource<Project>(
      { resourceType: 'Project', id: r4ProjectId, name: 'FHIR R4' },
      { assignedId: true }
    );
  }
  return r4Project;
}

async function createSuperAdmin(systemRepo: SystemRepository, config: ServerConfig): Promise<void> {
  const email = (config.defaultSuperAdminEmail ?? 'admin@example.com').toLowerCase();
  const password = config.defaultSuperAdminPassword ?? 'medplum_admin';
  const [firstName, lastName] = ['Medplum', 'Admin'];
  const passwordHash = await bcryptHashPassword(password);

  const { superAdminUser, superAdminProject } = await systemRepo.ensureInTransaction(
    async (txRepo) => {
      const superAdminUser = await txRepo.createResource<User>({
        resourceType: 'User',
        firstName,
        lastName,
        email,
        passwordHash,
      });

      const superAdminProject = await txRepo.createResource<Project>({
        resourceType: 'Project',
        name: 'Super Admin',
        owner: createReference(superAdminUser),
        superAdmin: true,
        strictMode: true,
      });

      if (config.defaultSuperAdminClientId && config.defaultSuperAdminClientSecret) {
        // Use specified client ID and secret
        const client = await txRepo.updateResource<ClientApplication>({
          meta: { project: superAdminProject.id },
          resourceType: 'ClientApplication',
          id: config.defaultSuperAdminClientId,
          name: 'Default Super Admin Client',
          secret: config.defaultSuperAdminClientSecret,
        });

        await txRepo.createResource<ProjectMembership>({
          meta: { project: superAdminProject.id },
          resourceType: 'ProjectMembership',
          project: createReference(superAdminProject),
          user: createReference(client),
          profile: createReference(client),
        });
      }

      return { superAdminUser, superAdminProject };
    },
    { resourceTypes: ['User', 'Project', 'ClientApplication', 'ProjectMembership'] }
  );

  const practitioner = await createProfile(systemRepo, superAdminProject, 'Practitioner', firstName, lastName, email);

  await createProjectMembership(systemRepo, superAdminUser, superAdminProject, practitioner, { admin: true });
}

async function seedBaseDefinitions(systemRepo: SystemRepository): Promise<void> {
  await systemRepo.ensureInTransaction(
    async (txRepo) => {
      globalLogger.info('Building structure definitions...');
      let startTime = Date.now();
      await rebuildR4StructureDefinitions(txRepo);
      globalLogger.info('Finished building structure definitions', { durationMs: Date.now() - startTime });

      globalLogger.info('Building value sets...');
      startTime = Date.now();
      await rebuildR4ValueSets(txRepo);
      globalLogger.info('Finished building value sets', { durationMs: Date.now() - startTime });

      globalLogger.info('Building search parameters...');
      startTime = Date.now();
      await rebuildR4SearchParameters(txRepo);
      globalLogger.info('Finished building search parameters', { durationMs: Date.now() - startTime });
    },
    {
      resourceTypes: ['StructureDefinition', 'OperationDefinition', 'ValueSet', 'CodeSystem', 'SearchParameter'],
      source: 'seedDatabase.rebuild',
    }
  );
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import { Practitioner, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import { bcryptHashPassword } from './auth/utils';
import { r4ProjectId } from './constants';
import { getSystemRepo, Repository } from './fhir/repo';
import { globalLogger } from './logger';
import { rebuildR4SearchParameters } from './seeds/searchparameters';
import { rebuildR4StructureDefinitions } from './seeds/structuredefinitions';
import { rebuildR4ValueSets } from './seeds/valuesets';
export async function seedDatabase(): Promise<void> {
  const systemRepo = getSystemRepo();

  if (await isSeeded(systemRepo)) {
    globalLogger.info('Already seeded');
    return;
  }

  await systemRepo.withTransaction(async () => {
    await createSuperAdmin(systemRepo);

    globalLogger.info('Building structure definitions...');
    let startTime = Date.now();
    await rebuildR4StructureDefinitions(systemRepo);
    globalLogger.info('Finished building structure definitions', { durationMs: Date.now() - startTime });

    globalLogger.info('Building value sets...');
    startTime = Date.now();
    await rebuildR4ValueSets(systemRepo);
    globalLogger.info('Finished building value sets', { durationMs: Date.now() - startTime });

    globalLogger.info('Building search parameters...');
    startTime = Date.now();
    await rebuildR4SearchParameters(systemRepo);
    globalLogger.info('Finished building search parameters', { durationMs: Date.now() - startTime });
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

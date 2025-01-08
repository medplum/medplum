import { createReference } from '@medplum/core';
import { Practitioner, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import { NIL as nullUuid, v5 } from 'uuid';
import { bcryptHashPassword } from './auth/utils';
import { getSystemRepo, Repository } from './fhir/repo';
import { globalLogger } from './logger';
import { rebuildR4SearchParameters } from './seeds/searchparameters';
import { rebuildR4StructureDefinitions } from './seeds/structuredefinitions';
import { rebuildR4ValueSets } from './seeds/valuesets';

/**
 * The hardcoded ID for the base FHIR R4 Project.
 * (161452d9-43b7-5c29-aa7b-c85680fa45c6)
 */
export const r4ProjectId = v5('R4', nullUuid);

export async function seedDatabase(): Promise<void> {
  if (await isSeeded()) {
    globalLogger.info('Already seeded');
    return;
  }

  const systemRepo = getSystemRepo();

  await systemRepo.withTransaction(async () => {
    await createSuperAdmin(systemRepo);

    globalLogger.info('Building structure definitions...');
    let startTime = Date.now();
    await rebuildR4StructureDefinitions();
    globalLogger.info('Finished building structure definitions', { durationMs: Date.now() - startTime });

    globalLogger.info('Building value sets...');
    startTime = Date.now();
    await rebuildR4ValueSets();
    globalLogger.info('Finished building value sets', { durationMs: Date.now() - startTime });

    globalLogger.info('Building search parameters...');
    startTime = Date.now();
    await rebuildR4SearchParameters();
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
 * @returns True if already seeded.
 */
function isSeeded(): Promise<User | undefined> {
  const systemRepo = getSystemRepo();
  return systemRepo.searchOne({ resourceType: 'User' });
}

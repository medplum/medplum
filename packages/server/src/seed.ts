import { createReference } from '@medplum/core';
import { Practitioner, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import { NIL as nullUuid, v5 } from 'uuid';
import { bcryptHashPassword } from './auth/utils';
import { getSystemRepo } from './fhir/repo';
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

  await rebuildR4StructureDefinitions();
  await rebuildR4ValueSets();
  await rebuildR4SearchParameters();
}

/**
 * Returns true if the database is already seeded.
 * @returns True if already seeded.
 */
function isSeeded(): Promise<User | undefined> {
  const systemRepo = getSystemRepo();
  return systemRepo.searchOne({ resourceType: 'User' });
}

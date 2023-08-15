import { createReference } from '@medplum/core';
import { Practitioner, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import { bcryptHashPassword } from './auth/utils';
import { systemRepo } from './fhir/repo';
import { logger } from './logger';
import { createSearchParameters } from './seeds/searchparameters';
import { rebuildR4StructureDefinitions } from './seeds/structuredefinitions';
import { createValueSets } from './seeds/valuesets';
import { v5, NIL as nullUuid } from 'uuid';

export const r4ProjectId = v5('R4', nullUuid);

export async function seedDatabase(): Promise<void> {
  if (await isSeeded()) {
    logger.info('Already seeded');
    return;
  }

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
  });

  const r4Project = await systemRepo.updateResource<Project>({
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

  await rebuildR4StructureDefinitions(r4Project);
  await createValueSets(r4Project);
  await createSearchParameters(r4Project);
}

/**
 * Returns true if the database is already seeded.
 * @returns True if already seeded.
 */
function isSeeded(): Promise<User | undefined> {
  return systemRepo.searchOne({ resourceType: 'User' });
}

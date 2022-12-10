import { createReference } from '@medplum/core';
import { Practitioner, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import bcrypt from 'bcryptjs';
import { systemRepo } from './fhir/repo';
import { logger } from './logger';
import { createSearchParameters } from './seeds/searchparameters';
import { createStructureDefinitions } from './seeds/structuredefinitions';
import { createValueSets } from './seeds/valuesets';

export async function seedDatabase(): Promise<void> {
  if (await isSeeded()) {
    logger.info('Already seeded');
    return;
  }

  const firstName = 'Medplum';
  const lastName = 'Admin';
  const projectName = 'Super Admin';
  const email = 'admin@example.com';
  const password = 'medplum_admin';

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await systemRepo.createResource<User>({
    resourceType: 'User',
    firstName,
    lastName,
    email,
    passwordHash,
  });

  const project = await systemRepo.createResource<Project>({
    resourceType: 'Project',
    name: projectName,
    owner: createReference(user),
    superAdmin: true,
  });

  const practitioner = await systemRepo.createResource<Practitioner>({
    resourceType: 'Practitioner',
    meta: {
      project: project.id,
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
    project: createReference(project),
    user: createReference(user),
    profile: createReference(practitioner),
    admin: true,
  });

  await createValueSets();
  await createSearchParameters();
  await createStructureDefinitions();
}

/**
 * Returns true if the database is already seeded.
 * @returns True if already seeded.
 */
async function isSeeded(): Promise<boolean> {
  const bundle = await systemRepo.search({
    resourceType: 'User',
    count: 1,
  });
  return !!bundle.entry && bundle.entry.length > 0;
}

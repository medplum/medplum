import { createReference } from '@medplum/core';
import { Practitioner, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import bcrypt from 'bcryptjs';
import { systemRepo } from './fhir';
import { logger } from './logger';
import { createSearchParameters } from './seeds/searchparameters';
import { createStructureDefinitions } from './seeds/structuredefinitions';
import { createValueSetElements } from './seeds/valuesets';

export async function seedDatabase(): Promise<void> {
  if (await isSeeded()) {
    logger.info('Already seeded');
    return;
  }

  const firstName = 'Medplum';
  const lastName = 'Admin';
  const projectName = 'Medplum';
  const email = 'admin@example.com';
  const password = 'medplum_admin';

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await systemRepo.createResource<User>({
    resourceType: 'User',
    email,
    passwordHash,
    admin: true,
  });

  const project = await systemRepo.createResource<Project>({
    resourceType: 'Project',
    name: projectName,
    owner: createReference(user),
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

  await createPublicProject(user);
  await createValueSetElements();
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

/**
 * Creates the public project.
 * This is a special project that is available to all users.
 * It includes 'implementation' resources such as CapabilityStatement.
 */
async function createPublicProject(owner: User): Promise<void> {
  logger.info('Create Public project...');
  const result = await systemRepo.createResource<Project>({
    resourceType: 'Project',
    name: 'Public',
    owner: createReference(owner),
  });
  logger.info('Created: ' + result.id);
}

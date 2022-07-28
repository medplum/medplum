import { assertOk, createReference } from '@medplum/core';
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
  const [userOutcome, user] = await systemRepo.createResource<User>({
    resourceType: 'User',
    email,
    passwordHash,
    admin: true,
  });
  assertOk(userOutcome, user);

  const [projectOutcome, project] = await systemRepo.createResource<Project>({
    resourceType: 'Project',
    name: projectName,
    owner: createReference(user),
  });
  assertOk(projectOutcome, project);

  const [practitionerOutcome, practitioner] = await systemRepo.createResource<Practitioner>({
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
  assertOk(practitionerOutcome, practitioner);

  const [membershipOutcome, membership] = await systemRepo.createResource<ProjectMembership>({
    resourceType: 'ProjectMembership',
    project: createReference(project),
    user: createReference(user),
    profile: createReference(practitioner),
    admin: true,
  });
  assertOk(membershipOutcome, membership);

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
  const [outcome, bundle] = await systemRepo.search({
    resourceType: 'User',
    count: 1,
  });
  assertOk(outcome, bundle);
  return !!bundle.entry && bundle.entry.length > 0;
}

/**
 * Creates the public project.
 * This is a special project that is available to all users.
 * It includes 'implementation' resources such as CapabilityStatement.
 */
async function createPublicProject(owner: User): Promise<void> {
  logger.info('Create Public project...');
  const [outcome, result] = await systemRepo.createResource<Project>({
    resourceType: 'Project',
    name: 'Public',
    owner: createReference(owner),
  });
  assertOk(outcome, result);
  logger.info('Created: ' + result.id);
}

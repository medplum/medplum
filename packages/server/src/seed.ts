import { createReference } from '@medplum/core';
import { Practitioner, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import { NIL as nullUuid, v5 } from 'uuid';
import { bcryptHashPassword } from './auth/utils';
import { getSystemRepo } from './fhir/repo';
import { globalLogger } from './logger';
import { RebuildOptions } from './seeds/common';
import { rebuildR4SearchParameters } from './seeds/searchparameters';
import { rebuildR4StructureDefinitions } from './seeds/structuredefinitions';
import { rebuildR4ValueSets } from './seeds/valuesets';

export const r4ProjectId = v5('R4', nullUuid);

/**
 * Seeds the database with system resources.
 *
 * @param options - Optional options for seeding the database.
 * @returns A Promise that resolves when seeding is done.
 */
export async function seedDatabase(options?: RebuildOptions): Promise<void> {
  if (await isSeeded()) {
    globalLogger.info('Already seeded');
    return;
  }

  performance.mark('Starting to seed');
  globalLogger.info('Seeding database...');

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

  globalLogger.info('Rebuilding system resources...');
  performance.mark('Starting rebuilds');

  performance.mark('Starting rebuildR4StructureDefinitions');
  await rebuildR4StructureDefinitions({ parallel: true, ...options });
  const sdStats = performance.measure(
    'Finished rebuildR4StructureDefinitions',
    'Starting rebuildR4StructureDefinitions'
  );
  globalLogger.info('Finished rebuildR4StructureDefinitions', {
    duration: `${Math.ceil(sdStats.duration)} ms`,
  });

  performance.mark('Starting rebuildR4ValueSets');
  await rebuildR4ValueSets({ parallel: true, ...options });
  const valueSetsStats = performance.measure('Finished rebuildR4ValueSets', 'Starting rebuildR4ValueSets');
  globalLogger.info('Finished rebuildR4ValueSets', { duration: `${Math.ceil(valueSetsStats.duration)} ms` });

  performance.mark('Starting rebuildR4SearchParameters');
  await rebuildR4SearchParameters({ parallel: true, ...options });
  const searchParamsStats = performance.measure(
    'Finished rebuildR4SearchParameters',
    'Starting rebuildR4SearchParameters'
  );
  globalLogger.info('Finished rebuildR4SearchParameters', {
    duration: `${Math.ceil(searchParamsStats.duration)} ms`,
  });

  const rebuildStats = performance.measure('Finished rebuilds', 'Starting rebuilds');
  globalLogger.info('Finished rebuilds', { duration: `${Math.ceil(rebuildStats.duration)} ms` });
  const seedingStats = performance.measure('Finished seeding', 'Starting to seed');
  globalLogger.info('Finished seeding', { duration: `${Math.ceil(seedingStats.duration)} ms` });
}

/**
 * Returns true if the database is already seeded.
 * @returns True if already seeded.
 */
function isSeeded(): Promise<User | undefined> {
  const systemRepo = getSystemRepo();
  return systemRepo.searchOne({ resourceType: 'User' });
}

import { createReference, getReferenceString, Operator } from '@medplum/core';
import { ClientApplication, Practitioner, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import { bcryptHashPassword } from './auth/utils';
import { r4ProjectId } from './constants';
import { getSystemRepo, Repository } from './fhir/repo';
import { globalLogger } from './logger';
import { rebuildR4SearchParameters } from './seeds/searchparameters';
import { rebuildR4StructureDefinitions } from './seeds/structuredefinitions';
import { rebuildR4ValueSets } from './seeds/valuesets';
import { createClient } from './admin/client';

const DO_PERF_TESTING = false;

export async function seedDatabase(): Promise<void> {
  const systemRepo = getSystemRepo();
  if (DO_PERF_TESTING) {
    await ensurePerfTestingResources(systemRepo);
  }

  if (await isSeeded()) {
    globalLogger.info('Already seeded');
    return;
  }

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

async function ensurePerfTestingResources(systemRepo: Repository): Promise<void> {
  const projects = await systemRepo.searchResources<Project>({
    resourceType: 'Project',
    filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Super Admin' }],
  });
  const superAdminProject = projects.find((p) => p.superAdmin);
  if (!superAdminProject) {
    throw new Error('Super Admin project not found, aborting.');
  }

  const clientAppName = 'Perf Testing Client Application';
  let clientApp = await systemRepo.searchOne<ClientApplication>({
    resourceType: 'ClientApplication',
    filters: [{ code: 'name', operator: Operator.EQUALS, value: clientAppName }],
  });

  if (clientApp) {
    console.log(`Found existing Perf Testing Client App: ${clientApp.id}`);
  } else {
    console.log('Creating new Perf Testing Client Application...');
    clientApp = await createClient(systemRepo, {
      project: superAdminProject,
      name: clientAppName,
    });
  }

  console.log(`Perf Testing Client App: ${clientApp.id} ${clientApp.secret}`);

  const email = 'ml@medplum.com';
  const superUsers = await systemRepo.searchResources<User>({
    resourceType: 'User',
    filters: [
      { code: 'email', operator: Operator.EQUALS, value: email },
      { code: 'project', operator: Operator.MISSING, value: 'true' },
    ],
  });

  if (superUsers.length !== 1) {
    console.log(superUsers.map((u) => JSON.stringify(u, null, 2)));
    throw new Error(`Expected one super user but found ${superUsers.length}`);
  }
  const superUser = superUsers[0];

  const pms = await systemRepo.searchResources<ProjectMembership & { id: string }>({
    resourceType: 'ProjectMembership',
    filters: [
      { code: 'project', operator: Operator.EQUALS, value: getReferenceString(superAdminProject) },
      { code: 'user', operator: Operator.EQUALS, value: getReferenceString(superUser) },
    ],
  });

  if (pms.length > 0) {
    console.log('Found existing', getReferenceString(pms[0]));
    if (pms.length > 1) {
      for (const pm of pms.slice(1)) {
        console.log('Deleting', pm.resourceType, pm.id);
        await systemRepo.deleteResource(pm.resourceType, pm.id);
      }
    }
    return;
  }

  const practitioners = await systemRepo.searchResources<Practitioner>({
    resourceType: 'Practitioner',
    filters: [
      { code: '_project', operator: Operator.EQUALS, value: getReferenceString(superAdminProject) },
      { code: 'email', operator: Operator.EQUALS, value: email },
    ],
  });
  let practitioner: Practitioner;
  if (practitioners.length > 0) {
    practitioner = practitioners[0];
  } else {
    practitioner = await systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: {
        project: superAdminProject.id,
      },
      name: [{ given: [superUser.firstName], family: superUser.lastName }],
      telecom: [{ system: 'email', use: 'work', value: superUser.email }],
    });
    console.log('Created', getReferenceString(practitioner));
  }

  const pm = await systemRepo.createResource<ProjectMembership>({
    resourceType: 'ProjectMembership',
    project: createReference(superAdminProject),
    user: createReference(superUser),
    profile: createReference(practitioner),
    admin: true,
  });
  console.log('Created', getReferenceString(pm));
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

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference, forbidden, isUUID } from '@medplum/core';
import type {
  AccessPolicy,
  ClientApplication,
  Parameters,
  ParametersParameter,
  Patient,
  Practitioner,
  Project,
  Reference,
  User,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../../app';
import { createUser } from '../../auth/newuser';
import { loadTestConfig } from '../../config/loader';
import type { ServerConfig } from '../../config/utils';
import { getUserByEmailWithoutProject } from '../../oauth/utils';
import {
  addTestUser,
  createTestProject,
  getSuperAdminAccessToken,
  getSuperAdminTestProject,
  initTestAuth,
  setupRecaptchaMock,
  withTestContext,
} from '../../test.setup';
import { getGlobalSystemRepo } from '../repo';
import { createProject, PRACTITIONER_READONLY_RESOURCE_TYPES } from './projectinit';

const fetchMock = vi.spyOn(globalThis, 'fetch');
const app = express();

function initProject(accessToken: string, parameter: ParametersParameter[]): request.Test {
  return request(app)
    .post(`/fhir/R4/Project/$init`)
    .set('Authorization', 'Bearer ' + accessToken)
    .set('Content-Type', ContentType.FHIR_JSON)
    .set('X-Medplum', 'extended')
    .send({ resourceType: 'Parameters', parameter } satisfies Parameters);
}

function createServerUser(email = randomUUID() + '@example.com', projectId?: string): Promise<WithId<User>> {
  return createUser({
    email,
    password: 'iaudhbrglkjhabdfligubhaedrg',
    firstName: 'Server',
    lastName: 'User',
    projectId,
  });
}

describe('Project $init', () => {
  let config: ServerConfig;
  let superAdminAccessToken: string;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);
    superAdminAccessToken = await getSuperAdminAccessToken();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    fetchMock.mockClear();
    setupRecaptchaMock(true);
  });

  test('Success', async () => {
    const { project: userProject } = await createTestProject();
    const { accessToken: userAccessToken } = await withTestContext(() => addTestUser(userProject));

    const projectName = 'Test Init Project ' + randomUUID();
    const owner = await createServerUser();

    const userRes = await initProject(userAccessToken, [{ name: 'name', valueString: projectName }]);
    expect(userRes).toHaveStatus(403);
    expect(userRes.body).toMatchObject(forbidden);

    const res = await initProject(superAdminAccessToken, [
      { name: 'name', valueString: projectName },
      { name: 'owner', valueReference: createReference(owner) },
    ]);
    expect(res).toHaveStatus(201);

    const project = res.body as WithId<Project>;
    expect(isUUID(project.id)).toBe(true);
    expect(project.owner).toStrictEqual(createReference(owner));

    // Open patient registration is disabled by default
    const updatedProject = await withTestContext(() =>
      getGlobalSystemRepo().readResource<Project>('Project', project.id)
    );
    expect(updatedProject.defaultPatientAccessPolicy).toBeUndefined();

    // Verify defaultAccessPolicies array is provisioned with Patient, RelatedPerson, Admin, Practitioner, and Bot entries
    expect(updatedProject.defaultAccessPolicies).toHaveLength(5);
    const patientEntry = updatedProject.defaultAccessPolicies?.find((p) => p.profileType === 'Patient');
    const relatedPersonEntry = updatedProject.defaultAccessPolicies?.find((p) => p.profileType === 'RelatedPerson');
    const adminEntry = updatedProject.defaultAccessPolicies?.find((p) => p.profileType === 'Admin');
    const practitionerEntry = updatedProject.defaultAccessPolicies?.find((p) => p.profileType === 'Practitioner');
    const botEntry = updatedProject.defaultAccessPolicies?.find((p) => p.profileType === 'Bot');
    expect(patientEntry?.accessPolicy.reference).toMatch(/^AccessPolicy\//);
    expect(relatedPersonEntry?.accessPolicy.reference).toMatch(/^AccessPolicy\//);
    expect(adminEntry?.accessPolicy.reference).toMatch(/^AccessPolicy\//);
    expect(practitionerEntry?.accessPolicy.reference).toMatch(/^AccessPolicy\//);
    expect(botEntry?.accessPolicy.reference).toMatch(/^AccessPolicy\//);
    // Each role gets a separate policy instance
    const references = [
      patientEntry?.accessPolicy.reference,
      relatedPersonEntry?.accessPolicy.reference,
      adminEntry?.accessPolicy.reference,
      practitionerEntry?.accessPolicy.reference,
      botEntry?.accessPolicy.reference,
    ];
    expect(new Set(references).size).toBe(5);

    // Verify the Admin default policy grants full read/write to everything
    const adminPolicy = await withTestContext(() =>
      getGlobalSystemRepo().readReference<AccessPolicy>(adminEntry?.accessPolicy as Reference<AccessPolicy>)
    );
    expect(adminPolicy.resource).toStrictEqual([{ resourceType: '*' }]);

    // Verify the Practitioner default policy is read-all + write-all-except-knowledge-resources
    const practitionerPolicy = await withTestContext(() =>
      getGlobalSystemRepo().readReference<AccessPolicy>(practitionerEntry?.accessPolicy as Reference<AccessPolicy>)
    );
    // Read access to everything via a readonly wildcard
    expect(practitionerPolicy.resource).toContainEqual({ resourceType: '*', readonly: true });
    // Writable clinical resource types are granted explicitly
    expect(practitionerPolicy.resource).toContainEqual({ resourceType: 'Patient' });
    expect(practitionerPolicy.resource).toContainEqual({ resourceType: 'Observation' });
    // Read-only resource types are NOT writable (only the readonly wildcard covers them)
    for (const readonlyType of PRACTITIONER_READONLY_RESOURCE_TYPES) {
      expect(practitionerPolicy.resource).not.toContainEqual({ resourceType: readonlyType });
    }
  });

  test('Default Bot access policy', () =>
    withTestContext(async () => {
      const { project } = await createProject('Test Bot Policy Project ' + randomUUID());
      const botEntry = project.defaultAccessPolicies?.find((p) => p.profileType === 'Bot');
      const botPolicy = await getGlobalSystemRepo().readReference<AccessPolicy>(
        botEntry?.accessPolicy as Reference<AccessPolicy>
      );

      const {
        project: botProject,
        accessPolicy,
        repo,
      } = await createTestProject({
        accessPolicy: { resource: botPolicy.resource },
        withRepo: true,
      });
      const systemRepo = getGlobalSystemRepo();
      const client = await systemRepo.createResource<ClientApplication>({
        resourceType: 'ClientApplication',
        meta: { project: botProject.id },
        name: 'Other Client',
        secret: 'secret',
        retiringSecret: 'retiring',
      });

      // Full access to everything else
      await expect(repo.createResource<Patient>({ resourceType: 'Patient' })).resolves.toBeDefined();

      // AccessPolicy is readable but not writable
      await expect(repo.readResource('AccessPolicy', accessPolicy.id)).resolves.toBeDefined();
      await expect(repo.updateResource({ ...accessPolicy, name: 'Changed' })).rejects.toThrow('Forbidden');

      // ClientApplication secrets are hidden and cannot be overwritten
      const readClient = await repo.readResource<ClientApplication>('ClientApplication', client.id);
      expect(readClient.name).toBe('Other Client');
      expect(readClient.secret).toBeUndefined();
      expect(readClient.retiringSecret).toBeUndefined();
      await repo.updateResource({ ...readClient, name: 'Renamed', secret: 'overwritten' });
      const updatedClient = await systemRepo.readResource<ClientApplication>('ClientApplication', client.id);
      expect(updatedClient.name).toBe('Renamed');
      expect(updatedClient.secret).toBe('secret');
      expect(updatedClient.retiringSecret).toBe('retiring');
    }));

  test('Requires project name', async () => {
    const res = await initProject(superAdminAccessToken, []);
    expect(res).toHaveStatus(400);
  });

  test('Requires owner to be User', async () => {
    const { repo } = await getSuperAdminTestProject();
    const doc = await withTestContext(() => repo.createResource<Practitioner>({ resourceType: 'Practitioner' }));

    const res = await initProject(superAdminAccessToken, [
      { name: 'name', valueString: 'Test Init Project ' + randomUUID() },
      { name: 'owner', valueReference: createReference(doc) },
    ]);
    expect(res).toHaveStatus(400);
  });

  test('Requires server User', async () => {
    const owner = await createServerUser(undefined, randomUUID());

    const res = await initProject(superAdminAccessToken, [
      { name: 'name', valueString: 'Test Init Project ' + randomUUID() },
      { name: 'owner', valueReference: createReference(owner) },
    ]);
    expect(res).toHaveStatus(400);
  });

  test('Looks up existing user by email', async () => {
    const ownerEmail = randomUUID() + '@example.com';
    const owner = await createServerUser(ownerEmail);

    const res = await initProject(superAdminAccessToken, [
      { name: 'name', valueString: 'Test Init Project ' + randomUUID() },
      { name: 'ownerEmail', valueString: ownerEmail },
    ]);
    expect(res).toHaveStatus(201);
    expect((res.body as Project).owner).toStrictEqual(createReference(owner));
  });

  test('Creates new owner User from email', async () => {
    const ownerEmail = randomUUID() + '@example.com';
    const parameter = [
      { name: 'name', valueString: 'Test Init Project ' + randomUUID() },
      { name: 'ownerEmail', valueString: ownerEmail },
    ];

    const clientRes = await initProject(await initTestAuth(), parameter);
    expect(clientRes).toHaveStatus(403);
    expect(await getUserByEmailWithoutProject(ownerEmail)).toBeUndefined();

    const res = await initProject(superAdminAccessToken, parameter);
    expect(res).toHaveStatus(201);
    const owner = await getUserByEmailWithoutProject(ownerEmail);
    expect((res.body as Project).owner).toStrictEqual(createReference(owner as WithId<User>));
  });

  test('Defaults to no owner and applies defaultProjectSystemSetting', async () => {
    const { project: superAdminProject } = await createTestProject({ superAdmin: true });
    const { accessToken } = await withTestContext(() => addTestUser(superAdminProject));

    const originalDefaultProjectSystemSetting = config.defaultProjectSystemSetting;
    config.defaultProjectSystemSetting = [{ name: 'searchTokenColumns', valueBoolean: true }];
    try {
      const res = await initProject(accessToken, [{ name: 'name', valueString: 'Test Init Project ' + randomUUID() }]);
      expect(res).toHaveStatus(201);
      const project = res.body as Project;
      expect(project.owner).toBeUndefined();
      expect(project.systemSetting).toStrictEqual(config.defaultProjectSystemSetting);
    } finally {
      config.defaultProjectSystemSetting = originalDefaultProjectSystemSetting;
    }
  });
});

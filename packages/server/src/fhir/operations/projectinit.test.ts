// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference, forbidden, getReferenceString, isUUID, Operator } from '@medplum/core';
import type {
  AccessPolicy,
  Bot,
  ClientApplication,
  Parameters,
  ParametersParameter,
  Patient,
  Practitioner,
  Project,
  ProjectMembership,
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
import { DEFAULT_ACCESS_POLICIES, getDefaultAccessPolicy } from '../default-access-policies';
import { getGlobalSystemRepo, getProjectSystemRepo } from '../repo';
import { createProject } from './projectinit';

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

    // Every profile type gets its own default policy instance
    const defaults = updatedProject.defaultAccessPolicies ?? [];
    expect(defaults.map((p) => p.profileType)).toContainExactly(Object.keys(DEFAULT_ACCESS_POLICIES));
    expect(new Set(defaults.map((p) => p.accessPolicy.reference)).size).toBe(defaults.length);
  });

  test('Default ClientApplication access policy', () =>
    withTestContext(async () => {
      const { project, client } = await createProject('Test Client Policy Project ' + randomUUID());
      const clientPolicyReference = getDefaultAccessPolicy(project, 'ClientApplication');

      // The project's default client gets the ClientApplication default
      const systemRepo = getGlobalSystemRepo();
      const clientMembership = await systemRepo.searchOne<ProjectMembership>({
        resourceType: 'ProjectMembership',
        filters: [{ code: 'profile', operator: Operator.EQUALS, value: getReferenceString(client) }],
      });
      expect(clientMembership?.accessPolicy?.reference).toBe(clientPolicyReference?.reference);

      const clientPolicy = await systemRepo.readReference(clientPolicyReference as Reference<AccessPolicy>);
      const {
        project: testProject,
        accessPolicy,
        repo,
      } = await createTestProject({
        accessPolicy: { resource: clientPolicy.resource },
        withRepo: true,
      });
      const projectSystemRepo = await getProjectSystemRepo(testProject);
      const bot = await projectSystemRepo.createResource<Bot>({
        resourceType: 'Bot',
        meta: { project: testProject.id },
        name: 'Test Bot',
      });

      // Full access to everything else
      await expect(repo.createResource<Patient>({ resourceType: 'Patient' })).resolves.toBeDefined();

      // Bot is readable but not writable
      const readBot = await repo.readResource<Bot>('Bot', bot.id);
      expect(readBot.name).toBe('Test Bot');
      await expect(repo.updateResource({ ...readBot, name: 'Changed' })).rejects.toThrow('Forbidden');
      await expect(repo.createResource<Bot>({ resourceType: 'Bot', name: 'New Bot' })).rejects.toThrow('Forbidden');

      // AccessPolicy is readable but not writable
      await expect(repo.readResource('AccessPolicy', accessPolicy.id)).resolves.toBeDefined();
      await expect(repo.updateResource({ ...accessPolicy, name: 'Changed' })).rejects.toThrow('Forbidden');

      // ClientApplication is readable with secrets hidden, but not writable
      const otherClient = await systemRepo.createResource<ClientApplication>({
        resourceType: 'ClientApplication',
        meta: { project: testProject.id },
        name: 'Other Client',
        secret: 'secret',
        retiringSecret: 'retiring',
      });
      const readClient = await repo.readResource<ClientApplication>('ClientApplication', otherClient.id);
      expect(readClient.name).toBe('Other Client');
      expect(readClient.secret).toBeUndefined();
      expect(readClient.retiringSecret).toBeUndefined();
      await expect(
        repo.updateResource({ ...readClient, jwksUri: 'https://attacker.example.com/jwks.json' })
      ).rejects.toThrow('Forbidden');
      await expect(
        repo.createResource<ClientApplication>({ resourceType: 'ClientApplication', name: 'New Client' })
      ).rejects.toThrow('Forbidden');
      const unchangedClient = await systemRepo.readResource<ClientApplication>('ClientApplication', otherClient.id);
      expect(unchangedClient.jwksUri).toBeUndefined();
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

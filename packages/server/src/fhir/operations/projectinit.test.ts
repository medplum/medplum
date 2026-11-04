// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference, getReferenceString, isUUID, Operator } from '@medplum/core';
import type {
  AccessPolicy,
  Bot,
  ClientApplication,
  Patient,
  Practitioner,
  Project,
  ProjectMembership,
  Reference,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../../app';
import { createUser } from '../../auth/newuser';
import { loadTestConfig } from '../../config/loader';
import type { ServerConfig } from '../../config/utils';
import {
  createTestProject,
  getSuperAdminAccessToken,
  getSuperAdminTestProject,
  initTestAuth,
  setupRecaptchaMock,
  withTestContext,
} from '../../test.setup';
import { getGlobalSystemRepo, getProjectSystemRepo } from '../repo';
import {
  CLIENT_APPLICATION_READONLY_RESOURCE_TYPES,
  createProject,
  PRACTITIONER_READONLY_RESOURCE_TYPES,
} from './projectinit';

const fetchMock = vi.spyOn(globalThis, 'fetch');
const app = express();

describe('Project $init', () => {
  let config: ServerConfig;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    fetchMock.mockClear();
    setupRecaptchaMock(true);
  });

  test('Success', async () => {
    const superAdminAccessToken = await getSuperAdminAccessToken();

    const projectName = 'Test Init Project ' + randomUUID();
    const owner = await createUser({
      email: randomUUID() + '@example.com',
      password: 'iaudhbrglkjhabdfligubhaedrg',
      firstName: projectName,
      lastName: 'Admin',
    });

    const res = await request(app)
      .post(`/fhir/R4/Project/$init`)
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'name',
            valueString: projectName,
          },
          {
            name: 'owner',
            valueReference: createReference(owner),
          },
        ],
      });
    expect(res).toHaveStatus(201);

    const project = res.body as WithId<Project>;
    expect(project.id).toBeDefined();
    expect(isUUID(project.id)).toBe(true);
    expect(project.owner).toStrictEqual(createReference(owner));

    // Open patient registration is disabled by default
    const updatedProject = await withTestContext(() =>
      getGlobalSystemRepo().readResource<Project>('Project', project.id)
    );
    expect(updatedProject.defaultPatientAccessPolicy).toBeUndefined();

    // Verify defaultAccessPolicies array is provisioned with Patient, RelatedPerson, Admin, Practitioner, Bot, and ClientApplication entries
    expect(updatedProject.defaultAccessPolicies).toHaveLength(6);
    const patientEntry = updatedProject.defaultAccessPolicies?.find((p) => p.profileType === 'Patient');
    const relatedPersonEntry = updatedProject.defaultAccessPolicies?.find((p) => p.profileType === 'RelatedPerson');
    const adminEntry = updatedProject.defaultAccessPolicies?.find((p) => p.profileType === 'Admin');
    const practitionerEntry = updatedProject.defaultAccessPolicies?.find((p) => p.profileType === 'Practitioner');
    const botEntry = updatedProject.defaultAccessPolicies?.find((p) => p.profileType === 'Bot');
    const clientEntry = updatedProject.defaultAccessPolicies?.find((p) => p.profileType === 'ClientApplication');
    expect(patientEntry?.accessPolicy.reference).toMatch(/^AccessPolicy\//);
    expect(relatedPersonEntry?.accessPolicy.reference).toMatch(/^AccessPolicy\//);
    expect(adminEntry?.accessPolicy.reference).toMatch(/^AccessPolicy\//);
    expect(practitionerEntry?.accessPolicy.reference).toMatch(/^AccessPolicy\//);
    expect(botEntry?.accessPolicy.reference).toMatch(/^AccessPolicy\//);
    expect(clientEntry?.accessPolicy.reference).toMatch(/^AccessPolicy\//);
    // Each role gets a separate policy instance
    const references = [
      patientEntry?.accessPolicy.reference,
      relatedPersonEntry?.accessPolicy.reference,
      adminEntry?.accessPolicy.reference,
      practitionerEntry?.accessPolicy.reference,
      botEntry?.accessPolicy.reference,
      clientEntry?.accessPolicy.reference,
    ];
    expect(new Set(references).size).toBe(6);

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

  test('Default ClientApplication access policy', () =>
    withTestContext(async () => {
      const { project, client } = await createProject('Test Client Policy Project ' + randomUUID());
      const clientEntry = project.defaultAccessPolicies?.find((p) => p.profileType === 'ClientApplication');
      expect(CLIENT_APPLICATION_READONLY_RESOURCE_TYPES).toStrictEqual(['AccessPolicy', 'Bot']);

      // The project's default client gets the ClientApplication default
      const systemRepo = getGlobalSystemRepo();
      const clientMembership = await systemRepo.searchOne<ProjectMembership>({
        resourceType: 'ProjectMembership',
        filters: [{ code: 'profile', operator: Operator.EQUALS, value: getReferenceString(client) }],
      });
      expect(clientMembership?.accessPolicy?.reference).toBe(clientEntry?.accessPolicy.reference);

      const clientPolicy = await systemRepo.readReference<AccessPolicy>(
        clientEntry?.accessPolicy as Reference<AccessPolicy>
      );
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
    const superAdminAccessToken = await getSuperAdminAccessToken();

    const owner = await createUser({
      email: randomUUID() + '@example.com',
      password: 'iaudhbrglkjhabdfligubhaedrg',
      firstName: 'The',
      lastName: 'Admin',
    });

    const res = await request(app)
      .post(`/fhir/R4/Project/$init`)
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'owner',
            valueReference: createReference(owner),
          },
        ],
      });
    expect(res).toHaveStatus(400);
  });

  test('Requires owner to be User', async () => {
    const { repo: superAdminRepo, accessToken: superAdminClientToken } = await getSuperAdminTestProject();
    const doc = await withTestContext(() =>
      superAdminRepo.createResource<Practitioner>({ resourceType: 'Practitioner' })
    );

    const projectName = 'Test Init Project ' + randomUUID();
    const res = await request(app)
      .post(`/fhir/R4/Project/$init`)
      .set('Authorization', 'Bearer ' + superAdminClientToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'name',
            valueString: projectName,
          },
          {
            name: 'owner',
            valueReference: createReference(doc),
          },
        ],
      });
    expect(res).toHaveStatus(400);
  });

  test('Requires server User', async () => {
    const accessToken = await initTestAuth();

    const projectName = 'Test Init Project ' + randomUUID();
    const owner = await createUser({
      email: randomUUID() + '@example.com',
      password: 'iaudhbrglkjhabdfligubhaedrg',
      firstName: 'Other Project',
      lastName: 'Member',
      projectId: randomUUID(),
    });

    const res = await request(app)
      .post(`/fhir/R4/Project/$init`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'name',
            valueString: projectName,
          },
          {
            name: 'owner',
            valueReference: createReference(owner),
          },
        ],
      });
    expect(res).toHaveStatus(400);
  });

  test('Looks up existing user by email', async () => {
    const accessToken = await initTestAuth();

    const ownerEmail = randomUUID() + '@example.com';
    const projectName = 'Test Init Project ' + randomUUID();
    const owner = await createUser({
      email: ownerEmail,
      password: 'iaudhbrglkjhabdfligubhaedrg',
      firstName: 'Server',
      lastName: 'User',
    });

    const res = await request(app)
      .post(`/fhir/R4/Project/$init`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'name',
            valueString: projectName,
          },
          {
            name: 'ownerEmail',
            valueString: ownerEmail,
          },
        ],
      });
    expect(res).toHaveStatus(201);

    const project = res.body as Project;
    expect(project.owner).toStrictEqual(createReference(owner));
  });

  test('Creates new owner User from email', async () => {
    const accessToken = await initTestAuth();

    const ownerEmail = randomUUID() + '@example.com';
    const projectName = 'Test Init Project ' + randomUUID();

    const res = await request(app)
      .post(`/fhir/R4/Project/$init`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'name',
            valueString: projectName,
          },
          {
            name: 'ownerEmail',
            valueString: ownerEmail,
          },
        ],
      });
    expect(res).toHaveStatus(201);
  });

  test('Defaults to no owner if unspecified', async () => {
    const accessToken = await initTestAuth();

    const projectName = 'Test Init Project ' + randomUUID();
    const res = await request(app)
      .post(`/fhir/R4/Project/$init`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'name',
            valueString: projectName,
          },
        ],
      });
    expect(res).toHaveStatus(201);
    const project = res.body as Project;
    expect(project.owner).toBeUndefined();
  });

  test('Specify defaultProjectSystemSetting', async () => {
    const originalDefaultProjectSystemSetting = config.defaultProjectSystemSetting;
    config.defaultProjectSystemSetting = [{ name: 'searchTokenColumns', valueBoolean: true }];

    const accessToken = await initTestAuth();
    const projectName = 'Test Init Project ' + randomUUID();
    const res = await request(app)
      .post(`/fhir/R4/Project/$init`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'name',
            valueString: projectName,
          },
        ],
      });
    expect(res).toHaveStatus(201);
    const project = res.body as Project;
    expect(project.owner).toBeUndefined();
    expect(project.systemSetting).toStrictEqual(config.defaultProjectSystemSetting);

    config.defaultProjectSystemSetting = originalDefaultProjectSystemSetting;
  });

  test('New project registration disabled', async () => {
    config.newProjectRegistrationEnabled = false;
    try {
      const body = {
        resourceType: 'Parameters',
        parameter: [{ name: 'name', valueString: 'Test Init Project ' + randomUUID() }],
      };

      const accessToken = await initTestAuth();
      const res1 = await request(app)
        .post(`/fhir/R4/Project/$init`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(body);
      expect(res1).toHaveStatus(400);
      expect(res1.body.issue[0].details.text).toBe('New project registration is disabled');

      // Super admins can still provision projects
      const superAdminAccessToken = await getSuperAdminAccessToken();
      const res2 = await request(app)
        .post(`/fhir/R4/Project/$init`)
        .set('Authorization', 'Bearer ' + superAdminAccessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(body);
      expect(res2).toHaveStatus(201);
    } finally {
      config.newProjectRegistrationEnabled = undefined;
    }
  });
});

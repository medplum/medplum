// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { AccessPolicy, ClientApplication, Project, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { createClient } from '../admin/client';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject, withTestContext } from '../test.setup';
import { createBot } from './operations/botinit';
import type { SystemRepository } from './repo';
import { getGlobalSystemRepo } from './repo';

const app = express();

describe('requireAccessPolicy project setting', () => {
  let systemRepo: SystemRepository;
  let project: Project & { id: string };
  let accessPolicy: AccessPolicy & { id: string };
  let clientWithPolicy: ClientApplication & { id: string };
  let clientWithoutPolicy: ClientApplication & { id: string };
  let userEmail: string;
  const userPassword = randomUUID();
  let userAccessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));
    systemRepo = getGlobalSystemRepo();

    // Members created before the setting is enabled, as in a project that turns it on later
    const created = await withTestContext(() =>
      createTestProject({
        withClient: true,
        withAccessToken: true,
        accessPolicy: { resource: [{ resourceType: '*' }] },
      })
    );
    project = created.project;
    accessPolicy = created.accessPolicy;
    clientWithPolicy = created.client;
    clientWithoutPolicy = await withTestContext(() => createClient(systemRepo, { project, name: 'No policy' }));

    userEmail = `${randomUUID()}@example.com`;
    await withTestContext(() =>
      inviteUser({
        project,
        resourceType: 'Practitioner',
        firstName: 'No',
        lastName: 'Policy',
        email: userEmail,
        password: userPassword,
        sendEmail: false,
      })
    );
    const loginRes = await request(app).post('/auth/login').type('json').send({
      email: userEmail,
      password: userPassword,
      projectId: project.id,
      scope: 'openid',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(loginRes).toHaveStatus(200);
    const tokenRes = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: loginRes.body.code,
      code_verifier: 'xyz',
    });
    userAccessToken = tokenRes.body.access_token;

    project = await withTestContext(() =>
      systemRepo.updateResource({ ...project, setting: [{ name: 'requireAccessPolicy', valueBoolean: true }] })
    );
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Rejects memberships without an access policy', () =>
    withTestContext(async () => {
      const membership: ProjectMembership = {
        resourceType: 'ProjectMembership',
        project: createReference(project),
        user: createReference(clientWithoutPolicy),
        profile: createReference(clientWithoutPolicy),
      };
      await expect(systemRepo.createResource(membership)).rejects.toThrow('Project requires an access policy');
      await expect(
        systemRepo.createResource({ ...membership, accessPolicy: createReference(accessPolicy) })
      ).resolves.toBeDefined();
      await expect(
        systemRepo.createResource({ ...membership, access: [{ policy: createReference(accessPolicy) }] })
      ).resolves.toBeDefined();
    }));

  test('Rejects new clients and bots without an access policy', () =>
    withTestContext(async () => {
      await expect(createClient(systemRepo, { project, name: 'New client' })).rejects.toThrow(
        'Project requires an access policy'
      );
      await expect(createBot(systemRepo, project, { name: 'New bot' })).rejects.toThrow(
        'Project requires an access policy'
      );
      await expect(
        createClient(systemRepo, { project, name: 'New client', accessPolicy: createReference(accessPolicy) })
      ).resolves.toBeDefined();
    }));

  test('Client credentials login requires an access policy', async () => {
    const res1 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: clientWithoutPolicy.id,
      client_secret: clientWithoutPolicy.secret,
    });
    expect(res1.status).toBe(400);
    expect(res1.body.access_token).toBeUndefined();

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: clientWithPolicy.id,
      client_secret: clientWithPolicy.secret,
    });
    expect(res2).toHaveStatus(200);
    expect(res2.body.access_token).toBeDefined();
  });

  test('Password login requires an access policy', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email: userEmail,
      password: userPassword,
      projectId: project.id,
      scope: 'openid',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toContain('Project requires an access policy');
  });

  test('Existing access tokens stop working without an access policy', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + userAccessToken);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toContain('Project requires an access policy');
  });
});

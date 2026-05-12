// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference, Operator } from '@medplum/core';
import type { Parameters, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { inviteUser } from '../../admin/invite';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { getAuthTokens, tryLogin } from '../../oauth/utils';
import { createTestProject } from '../../test.setup';
import { getGlobalSystemRepo } from '../repo';

async function superAdminToken(): Promise<string> {
  const res = await createTestProject({
    withAccessToken: true,
    project: { superAdmin: true },
  });
  return res.accessToken;
}

describe('User/$rescope', () => {
  const app = express();
  let project: WithId<Project>;
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    ({ project, accessToken } = await createTestProject({
      withAccessToken: true,
      withClient: true,
      membership: { admin: true },
    }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function invitedUser(scope: 'project' | 'server', inProject = project): Promise<WithId<User>> {
    const { user } = await inviteUser({
      project: inProject,
      email: `user+${randomUUID()}@example.com`,
      password: randomUUID(),
      sendEmail: false,
      resourceType: 'Practitioner',
      firstName: 'Test',
      lastName: 'User',
      scope,
      forceNewMembership: true,
    });
    return user;
  }

  test('Super admin rescopes global User to project', async () => {
    const user = await invitedUser('server');
    expect(user.project).toBeUndefined();

    const superToken = await superAdminToken();
    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$rescope`)
      .set('Authorization', 'Bearer ' + superToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'scope', valueCode: 'project' },
          { name: 'project', valueReference: createReference(project) },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(200);
    const updated = res.body as User;
    expect(updated.project?.reference).toStrictEqual(`Project/${project.id}`);
    expect(updated.meta?.project).toStrictEqual(project.id);
  });

  test('Super admin rescopes project User to global', async () => {
    const user = await invitedUser('project');
    expect(user.project?.reference).toStrictEqual(`Project/${project.id}`);

    const superToken = await superAdminToken();
    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$rescope`)
      .set('Authorization', 'Bearer ' + superToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'scope', valueCode: 'global' }],
      } satisfies Parameters);
    expect(res.status).toBe(200);
    const updated = res.body as User;
    expect(updated.project).toBeUndefined();
    expect(updated.meta?.project).toBeUndefined();
  });

  test('Project admin rescopes User in their project to global', async () => {
    const user = await invitedUser('project');

    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$rescope`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'scope', valueCode: 'global' }],
      } satisfies Parameters);
    expect(res.status).toBe(200);
    const updated = res.body as User;
    expect(updated.project).toBeUndefined();

    // Verify by reading through system repo
    const systemRepo = getGlobalSystemRepo();
    const reread = await systemRepo.readResource<User>('User', user.id);
    expect(reread.project).toBeUndefined();
    expect(reread.meta?.project).toBeUndefined();
  });

  test('Project admin cannot promote User to project scope', async () => {
    const user = await invitedUser('server');

    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$rescope`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'scope', valueCode: 'project' },
          { name: 'project', valueReference: createReference(project) },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(404);
  });

  test('Project admin cannot rescope User from a different project', async () => {
    const { project: otherProject } = await createTestProject();
    const user = await invitedUser('project', otherProject);

    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$rescope`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'scope', valueCode: 'global' }],
      } satisfies Parameters);
    expect(res.status).toBe(404);

    // Verify untouched
    const systemRepo = getGlobalSystemRepo();
    const reread = await systemRepo.readResource<User>('User', user.id);
    expect(reread.project?.reference).toStrictEqual(`Project/${otherProject.id}`);
  });

  test('Super admin blocked by read-only User access policy returns 403', async () => {
    // Exercises the canPerformInteraction(UPDATE, user) = false branch. Only super admins
    // can reach this branch in practice: for project admins, accesspolicy.ts strips any
    // user-provided User policy entries and re-adds defaults that grant User updates,
    // so a project admin cannot be blocked here.
    const user = await invitedUser('project');

    const { accessToken: restrictedSuperToken } = await createTestProject({
      withAccessToken: true,
      project: { superAdmin: true },
      accessPolicy: { resource: [{ resourceType: 'User', readonly: true }] },
    });

    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$rescope`)
      .set('Authorization', 'Bearer ' + restrictedSuperToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'scope', valueCode: 'global' }],
      } satisfies Parameters);
    expect(res.status).toBe(403);
  });

  test('Project admin attempting project rescope on User in their project returns 403', async () => {
    // The User is in the admin's project, so the read succeeds; the request is rejected
    // by the role check (project rescope requires super admin).
    const user = await invitedUser('project');

    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$rescope`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'scope', valueCode: 'project' },
          { name: 'project', valueReference: createReference(project) },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(403);
  });

  describe('Non-admin', () => {
    let nonAdminToken: string;
    let nonAdminUserId: string;

    beforeAll(async () => {
      const email = `user+${randomUUID()}@example.com`;
      const password = randomUUID();
      const { user, profile } = await inviteUser({
        project,
        email,
        password,
        sendEmail: false,
        resourceType: 'Practitioner',
        firstName: 'Non',
        lastName: 'Admin',
        scope: 'project',
        forceNewMembership: true,
      });
      nonAdminUserId = user.id;

      const login = await tryLogin({
        email,
        password,
        projectId: project.id,
        authMethod: 'password',
        scope: 'openid *.*',
        nonce: randomUUID(),
      });
      ({ accessToken: nonAdminToken } = await getAuthTokens(user, login, createReference(profile)));
    });

    test('cannot rescope to global', async () => {
      const res = await request(app)
        .post(`/fhir/R4/User/${nonAdminUserId}/$rescope`)
        .set('Authorization', 'Bearer ' + nonAdminToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .set('X-Medplum', 'extended')
        .send({
          resourceType: 'Parameters',
          parameter: [{ name: 'scope', valueCode: 'global' }],
        } satisfies Parameters);
      expect(res.status).toBe(403);
    });

    test('cannot rescope to project', async () => {
      const res = await request(app)
        .post(`/fhir/R4/User/${nonAdminUserId}/$rescope`)
        .set('Authorization', 'Bearer ' + nonAdminToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .set('X-Medplum', 'extended')
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'scope', valueCode: 'project' },
            { name: 'project', valueReference: createReference(project) },
          ],
        } satisfies Parameters);
      expect(res.status).toBe(403);
    });
  });

  test('Missing project reference for scope=project returns 400', async () => {
    const user = await invitedUser('server');
    const superToken = await superAdminToken();

    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$rescope`)
      .set('Authorization', 'Bearer ' + superToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'scope', valueCode: 'project' }],
      } satisfies Parameters);
    expect(res.status).toBe(400);
  });

  test('Invalid scope value returns 400', async () => {
    const user = await invitedUser('project');
    const superToken = await superAdminToken();

    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$rescope`)
      .set('Authorization', 'Bearer ' + superToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'scope', valueCode: 'elsewhere' }],
      } satisfies Parameters);
    expect(res.status).toBe(400);
  });

  test('Already global returns 400 when rescoping to global', async () => {
    const user = await invitedUser('server');
    const superToken = await superAdminToken();

    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$rescope`)
      .set('Authorization', 'Bearer ' + superToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'scope', valueCode: 'global' }],
      } satisfies Parameters);
    expect(res.status).toBe(400);
  });

  test('Already in target project returns 400 when rescoping to same project', async () => {
    const user = await invitedUser('project');
    const superToken = await superAdminToken();

    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$rescope`)
      .set('Authorization', 'Bearer ' + superToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'scope', valueCode: 'project' },
          { name: 'project', valueReference: createReference(project) },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(400);
  });

  test('Super admin can move User between projects', async () => {
    const { project: otherProject } = await createTestProject();
    const user = await invitedUser('project');

    // Remove the membership in the original project so the user only has memberships in the target project
    const systemRepo = getGlobalSystemRepo();
    const memberships = await systemRepo.searchResources<ProjectMembership>({
      resourceType: 'ProjectMembership',
      filters: [{ code: 'user', operator: Operator.EQUALS, value: `User/${user.id}` }],
    });
    for (const m of memberships) {
      await systemRepo.deleteResource('ProjectMembership', m.id);
    }

    const superToken = await superAdminToken();
    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$rescope`)
      .set('Authorization', 'Bearer ' + superToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'scope', valueCode: 'project' },
          { name: 'project', valueReference: createReference(otherProject) },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(200);
    const updated = res.body as User;
    expect(updated.project?.reference).toStrictEqual(`Project/${otherProject.id}`);
    expect(updated.meta?.project).toStrictEqual(otherProject.id);
  });

  test('Project admin cannot rescope User in a linked project', async () => {
    // Project linking must not be usable as a rescope escalation path. Even with `User`
    // explicitly listed in the linked project's exportedResourceType, the User is still
    // unreachable cross-project because User is a project-admin resource type, so the
    // read returns 404 before authorization is checked.
    const { project: linkedProject } = await createTestProject({
      project: { exportedResourceType: ['User'] },
    });
    const user = await invitedUser('project', linkedProject);

    const { accessToken: mainAdminToken } = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
      project: { link: [{ project: createReference(linkedProject) }] },
    });

    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$rescope`)
      .set('Authorization', 'Bearer ' + mainAdminToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'scope', valueCode: 'global' }],
      } satisfies Parameters);
    expect(res.status).toBe(404);

    const systemRepo = getGlobalSystemRepo();
    const reread = await systemRepo.readResource<User>('User', user.id);
    expect(reread.project?.reference).toStrictEqual(`Project/${linkedProject.id}`);
  });

  test.each([
    { name: 'wrong resource type', reference: `Patient/${randomUUID()}` },
    { name: 'missing id', reference: 'Project/' },
    { name: 'missing resource type', reference: `/${randomUUID()}` },
    { name: 'no slash', reference: 'not-a-reference' },
  ])('Invalid project reference ($name) returns 400', async ({ reference }) => {
    const user = await invitedUser('server');
    const superToken = await superAdminToken();

    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$rescope`)
      .set('Authorization', 'Bearer ' + superToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'scope', valueCode: 'project' },
          { name: 'project', valueReference: { reference } },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(400);
  });

  test('Target project does not exist returns 404', async () => {
    const user = await invitedUser('server');
    const superToken = await superAdminToken();

    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$rescope`)
      .set('Authorization', 'Bearer ' + superToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'scope', valueCode: 'project' },
          { name: 'project', valueReference: { reference: `Project/${randomUUID()}` } },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(404);
  });

  test('Cannot rescope to project when User has membership in another project', async () => {
    const { project: otherProject } = await createTestProject();
    // Invite into otherProject so the User has a membership there
    const user = await invitedUser('server', otherProject);

    const superToken = await superAdminToken();
    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$rescope`)
      .set('Authorization', 'Bearer ' + superToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'scope', valueCode: 'project' },
          { name: 'project', valueReference: createReference(project) },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/another project/);
  });
});

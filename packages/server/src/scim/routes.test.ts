// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference } from '@medplum/core';
import type { AccessPolicy, Project, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config/loader';
import type { SystemRepository } from '../fhir/repo';
import { getGlobalSystemRepo, getProjectSystemRepo } from '../fhir/repo';
import { addTestUser, withTestContext } from '../test.setup';

describe('SCIM Routes', () => {
  const app = express();
  let accessToken: string;
  let systemRepo: SystemRepository;
  let project: WithId<Project>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    // First, Alice creates a project
    const registration = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });
    accessToken = registration.accessToken;
    project = registration.project;
    systemRepo = await getProjectSystemRepo(registration.project);

    // Create default access policy
    const accessPolicy = await systemRepo.createResource<AccessPolicy>({
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: 'Patient' }],
    });

    // Update project with default access policy
    await systemRepo.updateResource({
      ...registration.project,
      defaultPatientAccessPolicy: createReference(accessPolicy),
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Search users', async () => {
    const res = await request(app)
      .get(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);

    const result = res.body;
    expect(result.totalResults).toBeDefined();
    expect(result.Resources).toBeDefined();
  });

  test('Create and update user', async () => {
    const res1 = await request(app)
      .post(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userType: 'Patient',
        name: {
          givenName: 'SCIM',
          familyName: 'User',
        },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    expect(res1).toHaveStatus(201);

    const readResponse = await request(app)
      .get(`/scim/v2/Users/${res1.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(readResponse).toHaveStatus(200);
    expect(readResponse.body.id).toBe(res1.body.id);

    const searchResponse = await request(app)
      .get(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(searchResponse).toHaveStatus(200);

    const searchCheck = searchResponse.body.Resources.find((user: any) => user.id === res1.body.id);
    expect(searchCheck).toBeDefined();

    const updateResponse = await request(app)
      .put(`/scim/v2/Users/${res1.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        ...res1.body,
        externalId: randomUUID(),
      });
    expect(updateResponse).toHaveStatus(200);
    expect(updateResponse.body.externalId).toBeDefined();

    const deleteResponse = await request(app)
      .delete(`/scim/v2/Users/${res1.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(deleteResponse).toHaveStatus(204);

    const searchResponse2 = await request(app)
      .get(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(searchResponse2).toHaveStatus(200);

    const searchCheck2 = searchResponse2.body.Resources.find((user: any) => user.id === res1.body.id);
    expect(searchCheck2).toBeUndefined();
  });

  test('Create and patch user', async () => {
    const res1 = await request(app)
      .post(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userType: 'Patient',
        name: {
          givenName: 'SCIM',
          familyName: 'User',
        },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    expect(res1).toHaveStatus(201);

    const readResponse = await request(app)
      .get(`/scim/v2/Users/${res1.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(readResponse).toHaveStatus(200);
    expect(readResponse.body.id).toBe(res1.body.id);
    expect(readResponse.body.active).toBe(true);

    const searchResponse = await request(app)
      .get(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(searchResponse).toHaveStatus(200);

    const searchCheck = searchResponse.body.Resources.find((user: any) => user.id === res1.body.id);
    expect(searchCheck).toBeDefined();

    const patchResponse = await request(app)
      .patch(`/scim/v2/Users/${res1.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          {
            op: 'replace',
            value: {
              active: false,
            },
          },
        ],
      });
    expect(patchResponse).toHaveStatus(200);
    expect(patchResponse.body.active).toBe(false);
  });

  test('Create, missing medplum user type, creates a Practitioner', async () => {
    const res = await request(app)
      .post(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        name: {
          givenName: 'SCIM',
          familyName: 'User',
        },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    expect(res).toHaveStatus(201);
    expect(res.body.userType).toBe('Practitioner');
  });

  test('Reject update of server-scoped user', async () => {
    // Bob registers his own project, which creates a server-scoped (global) User
    const bobEmail = `bob${randomUUID()}@example.com`;
    const bob = await withTestContext(() =>
      registerNew({
        firstName: 'Bob',
        lastName: 'Jones',
        projectName: 'Bob Project',
        email: bobEmail,
        password: 'password!@#',
      })
    );
    expect(bob.user.project).toBeUndefined();

    // Alice invites Bob by email, which reuses Bob's existing global User
    const { membership, user } = await withTestContext(() =>
      inviteUser({
        project,
        email: bobEmail,
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        sendEmail: false,
      })
    );
    expect(user.id).toBe(bob.user.id);
    expect(user.project).toBeUndefined();
    expect(membership.project?.reference).toBe(`Project/${project.id}`);

    // The membership is in Alice's project, but the User is not, so Alice cannot write to it
    const newEmail = `attacker${randomUUID()}@example.com`;
    const updateResponse = await request(app)
      .put(`/scim/v2/Users/${membership.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        id: membership.id,
        userType: 'Practitioner',
        name: { givenName: 'Bob', familyName: 'Jones' },
        emails: [{ value: newEmail }],
      });
    expect(updateResponse).toHaveStatus(403);

    const patchResponse = await request(app)
      .patch(`/scim/v2/Users/${membership.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', value: { emails: [{ value: newEmail }] } }],
      });
    expect(patchResponse).toHaveStatus(403);

    // Bob's login email is unchanged
    const bobUser = await getGlobalSystemRepo().readResource<User>('User', bob.user.id);
    expect(bobUser.email).toBe(bobEmail);
  });

  test('Reject update of user from another project', async () => {
    // Bob is a project-scoped user in his own project
    const bob = await withTestContext(() =>
      registerNew({
        firstName: 'Bob',
        lastName: 'Jones',
        projectName: 'Bob Project',
        email: `bob${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );
    const bobPatient = await withTestContext(() =>
      addTestUser(bob.project, { resourceType: 'Patient', accessPolicy: { resourceType: 'AccessPolicy' } })
    );
    expect(bobPatient.user.project?.reference).toBe(`Project/${bob.project.id}`);

    // Alice references Bob's project membership, which is not in her project
    const updateResponse = await request(app)
      .put(`/scim/v2/Users/${bobPatient.membership.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        id: bobPatient.membership.id,
        userType: 'Patient',
        name: { givenName: 'Bob', familyName: 'Jones' },
        emails: [{ value: `attacker${randomUUID()}@example.com` }],
      });
    expect(updateResponse).toHaveStatus(403);

    const bobUser = await getGlobalSystemRepo().readResource<User>('User', bobPatient.user.id);
    expect(bobUser.email).toBe(bobPatient.user.email);
  });

  test('Deactivate server-scoped user', async () => {
    // Bob registers his own project, which creates a server-scoped (global) User
    const bobEmail = `bob${randomUUID()}@example.com`;
    const bob = await withTestContext(() =>
      registerNew({
        firstName: 'Bob',
        lastName: 'Jones',
        projectName: 'Bob Project',
        email: bobEmail,
        password: 'password!@#',
      })
    );

    // Alice invites Bob by email, which reuses Bob's existing global User
    const { membership, user } = await withTestContext(() =>
      inviteUser({
        project,
        email: bobEmail,
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        sendEmail: false,
      })
    );
    expect(user.id).toBe(bob.user.id);
    expect(user.project).toBeUndefined();

    const before = await getGlobalSystemRepo().readResource<User>('User', user.id);

    // Alice owns the membership, so she can still deactivate Bob within her own project
    const patchResponse = await request(app)
      .patch(`/scim/v2/Users/${membership.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', value: { active: false } }],
      });
    expect(patchResponse).toHaveStatus(200);
    expect(patchResponse.body.active).toBe(false);

    // Bob's global User was not written at all
    const after = await getGlobalSystemRepo().readResource<User>('User', user.id);
    expect(after.email).toBe(bobEmail);
    expect(after.meta?.versionId).toBe(before.meta?.versionId);
  });

  test('Search users as super admin', async () => {
    // Create new project
    const registration = await withTestContext(async () => {
      const reg = await registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      });

      // Make the project super admin
      const systemRepo = await getProjectSystemRepo(reg.project);
      await systemRepo.updateResource({
        ...reg.project,
        superAdmin: true,
      });
      return reg;
    });

    // Add another user
    // This user is a super admin
    // This user is not a project admin
    // They should still be allowed to use SCIM
    const { accessToken } = await addTestUser(registration.project);

    const res = await request(app)
      .get(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);

    const result = res.body;
    expect(result.totalResults).toBeDefined();
    expect(result.Resources).toBeDefined();
  });
});

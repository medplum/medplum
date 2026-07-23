// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, getReferenceString } from '@medplum/core';
import type { ProjectMembership, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../app';
import type { RegisterResponse } from '../auth/register';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config/loader';
import { getGlobalSystemRepo } from '../fhir/repo';
import { addTestUser, setupRecaptchaMock, withTestContext } from '../test.setup';
import { inviteUser } from './invite';

const fetchMock = vi.spyOn(globalThis, 'fetch');
const app = express();

// create testProjectAdmin to use for set password
let testProjectAdmin: RegisterResponse;

describe('Project Admin routes', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));

    // Register and create a project
    testProjectAdmin = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    fetchMock.mockClear();
    setupRecaptchaMock(true);
  });

  test('Get project and promote admin', async () => {
    // Register and create a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'John',
        lastName: 'Adams',
        projectName: 'Adams Project',
        email: `john${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Invite a new member
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: `bob${randomUUID()}@example.com`,
      });
    expect(res2).toHaveStatus(200);

    // Get the project details
    // Make sure the new member is in the members list
    // Get the project details and members
    // 3 members total (1 admin, 1 client, 1 invited)
    const res3 = await request(app)
      .get('/fhir/R4/ProjectMembership')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('X-Medplum', 'extended');
    expect(res3).toHaveStatus(200);
    expect(res3.body.entry).toBeDefined();
    expect(res3.body.entry.length).toStrictEqual(3);

    const members = res3.body.entry.map((e: any) => e.resource) as ProjectMembership[];
    const owner = members.find((m) => m.admin);
    expect(owner).toBeDefined();
    const member = members.find((m) => m.id === res2.body.id) as ProjectMembership;
    expect(member).toBeDefined();
    expect(member.meta?.author?.reference).toStrictEqual('system');

    // Get the new membership details
    const res4 = await request(app)
      .get('/admin/projects/' + project.id + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('X-Medplum', 'extended');
    expect(res4).toHaveStatus(200);
    expect(res4.body.resourceType).toStrictEqual('ProjectMembership');
    expect(res4.body.id).toBeDefined();
    expect(res4.body.meta.project).toStrictEqual(project.id);

    // Try a naughty request using a different resource type
    const res5 = await request(app)
      .post('/admin/projects/' + project.id + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        resourceType: 'Patient',
      });
    expect(res5).toHaveStatus(403);

    // Try a naughty request using a different membership
    const res6 = await request(app)
      .post('/admin/projects/' + project.id + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        resourceType: 'ProjectMembership',
        id: randomUUID(),
      });
    expect(res6).toHaveStatus(403);

    // Promote the new member to admin
    const res7 = await request(app)
      .post('/admin/projects/' + project.id + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('X-Medplum', 'extended')
      .type('json')
      .send({
        ...res4.body,
        admin: true,
      });
    expect(res7).toHaveStatus(200);
    expect(res7.body.meta?.author?.reference).toStrictEqual(owner?.profile?.reference);

    // Make sure the new member is an admin
    const res8 = await request(app)
      .get('/fhir/R4/ProjectMembership/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res8).toHaveStatus(200);
    expect(res8.body.admin).toBe(true);
  });

  test('Get project access denied', async () => {
    const aliceRegistration = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const bobRegistration = await addTestUser(aliceRegistration.project, {
      accessPolicy: { resourceType: 'AccessPolicy' },
    });

    // Try to access Alice's project using Alices's access token
    // Should succeed
    const res3 = await request(app)
      .get('/admin/projects/' + aliceRegistration.project.id)
      .set('Authorization', 'Bearer ' + aliceRegistration.accessToken);

    expect(res3).toHaveStatus(200);

    // Try to access Alice's project members using Alices's access token
    const membersRes = await request(app)
      .get('/fhir/R4/ProjectMembership')
      .set('Authorization', 'Bearer ' + aliceRegistration.accessToken);
    expect(membersRes).toHaveStatus(200);
    const members = membersRes.body.entry.map((e: any) => e.resource) as ProjectMembership[];

    // Try to access Alice's project using Bob's access token
    // Should fail
    const res4 = await request(app)
      .get('/admin/projects/' + aliceRegistration.project.id)
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken);

    expect(res4).toHaveStatus(403);

    // Try to access Alice's project members using Bob's access token
    // Should fail
    const res5 = await request(app)
      .get('/admin/projects/' + aliceRegistration.project.id + '/members/' + members[0].id)
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken);

    expect(res5).toHaveStatus(403);

    // Try to edit Alice's project members using Bob's access token
    // Should fail
    const res6 = await request(app)
      .post('/admin/projects/' + aliceRegistration.project.id + '/members/' + members[0].id)
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken)
      .type('json')
      .send({ resourceType: 'ProjectMembership' });

    expect(res6).toHaveStatus(403);

    // Try to create a new client in Alice's project using Alices's access token
    // Should succeed
    const res9 = await request(app)
      .post('/admin/projects/' + aliceRegistration.project.id + '/client')
      .set('Authorization', 'Bearer ' + aliceRegistration.accessToken)
      .type('json')
      .send({
        resourceType: 'ClientApplication',
        name: 'Test client',
      });

    expect(res9).toHaveStatus(201);

    const clientId = res9.body.id;

    // Try to read Alice's client using Alices's access token
    // Should succeed
    const res7 = await request(app)
      .get('/fhir/R4/ClientApplication/' + clientId)
      .set('Authorization', 'Bearer ' + aliceRegistration.accessToken);

    expect(res7).toHaveStatus(200);

    // Try to read Alice's client using Bob's access token
    // Should fail
    const res8 = await request(app)
      .get('/fhir/R4/ClientApplication/' + clientId)
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken);

    expect(res8).toHaveStatus(403);

    // Try to create a new client in Alice's project using Bob's access token
    // Should fail
    const res10 = await request(app)
      .post('/admin/projects/' + aliceRegistration.project.id + '/client')
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken);

    expect(res10).toHaveStatus(403);

    // Try to delete Alice's project members using Bob's access token
    // Should fail
    const res11 = await request(app)
      .delete('/admin/projects/' + aliceRegistration.project.id + '/members/' + members[0].id)
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken);

    expect(res11).toHaveStatus(403);

    // Try to create a bot using Bob's access token
    // Should fail
    const res12 = await request(app)
      .post('/admin/projects/' + aliceRegistration.project.id + '/bot')
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken)
      .type('json')
      .send({
        name: 'Alice personal bot',
        description: 'Alice bot description',
      });

    expect(res12).toHaveStatus(403);

    // Try to update secrets using Bob's access token
    // Should fail
    const res13 = await request(app)
      .post('/admin/projects/' + aliceRegistration.project.id + '/secrets')
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken)
      .type('json')
      .send([
        {
          name: 'test_secret',
          valueString: 'test_value',
        },
      ]);

    expect(res13).toHaveStatus(403);

    // Try to update sites using Bob's access token
    // Should fail
    const res14 = await request(app)
      .post('/admin/projects/' + aliceRegistration.project.id + '/sites')
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken)
      .type('json')
      .send([
        {
          name: 'test_site',
          domain: ['example.com'],
        },
      ]);

    expect(res14).toHaveStatus(403);

    // Try to update settings using Bob's access token
    // Should fail
    const res15 = await request(app)
      .post('/admin/projects/' + aliceRegistration.project.id + '/settings')
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken)
      .type('json')
      .send([
        {
          name: 'test_setting',
          valueString: 'test_value',
        },
      ]);

    expect(res15).toHaveStatus(403);
  });

  test('Delete membership', async () => {
    // Register and create a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Delete membership project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Invite a new member
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: `bob${randomUUID()}@example.com`,
      });
    expect(res2).toHaveStatus(200);

    // Get the project details
    // Make sure the new member is in the members list
    // Get the project details and members
    // 3 members total (1 admin, 1 client, 1 invited)
    const res3 = await request(app)
      .get('/admin/projects/' + project.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(200);
    expect(res3.body.project).toBeDefined();

    // Try to access Alice's project members using Alices's access token
    const membersRes = await request(app)
      .get('/fhir/R4/ProjectMembership')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(membersRes).toHaveStatus(200);
    const members = membersRes.body.entry.map((e: any) => e.resource) as ProjectMembership[];

    const owner = members.find(
      (m) => m.profile?.reference?.startsWith('Practitioner/') && m.admin
    ) as ProjectMembership;
    expect(owner).toBeDefined();
    const member = members.find(
      (m) => m.profile?.reference?.startsWith('Practitioner/') && !m.admin
    ) as ProjectMembership;
    expect(member).toBeDefined();

    // Get the new membership details as Alice
    const res4 = await request(app)
      .get('/admin/projects/' + project.id + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4).toHaveStatus(200);

    // Now remove Bob as Alice
    // This should succeed
    const res5 = await request(app)
      .delete('/admin/projects/' + project.id + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res5).toHaveStatus(200);

    // Get the project details
    // Make sure the new member is an admin
    // 2 members total (1 admin, 1 client)
    const res6 = await request(app)
      .get('/admin/projects/' + project.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res6).toHaveStatus(200);
    expect(res6.body.project).toBeDefined();

    // Alice try to delete her own membership
    // This should fail
    const res7 = await request(app)
      .delete('/admin/projects/' + project.id + '/members/' + owner.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res7).toHaveStatus(400);
    expect(res7.body).toMatchObject({
      issue: [
        {
          code: 'invalid',
          details: {
            text: 'Cannot delete the owner of the project',
          },
        },
      ],
    });

    // Alice try to delete a non-existent membership
    // This should fail
    const res8 = await request(app)
      .delete('/admin/projects/' + project.id + '/members/' + randomUUID())
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res8).toHaveStatus(404);
    expect(res8.body).toMatchObject({
      issue: [
        {
          code: 'not-found',
          details: {
            text: 'Not found',
          },
        },
      ],
    });
  });

  test('Delete project-scoped user membership also deletes User resource', async () => {
    // Register and create a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Delete project-scoped user project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Invite a project-scoped user (Patient is project-scoped by default)
    const patientEmail = `patient${randomUUID()}@example.com`;
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Patient',
        firstName: 'John',
        lastName: 'Patient',
        email: patientEmail,
      });
    expect(res2).toHaveStatus(200);

    // Get the membership
    const membersRes = await request(app)
      .get('/fhir/R4/ProjectMembership')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(membersRes).toHaveStatus(200);
    const members = membersRes.body.entry.map((e: any) => e.resource) as ProjectMembership[];
    const patientMember = members.find(
      (m) => m.profile?.reference?.startsWith('Patient/') && !m.admin
    ) as ProjectMembership;
    expect(patientMember).toBeDefined();

    // Verify the user is project-scoped
    const systemRepo = getGlobalSystemRepo();
    const user = await systemRepo.readReference<User>(patientMember.user as any);
    expect(user.project?.reference).toBe(getReferenceString(project));

    // Delete the membership
    const res3 = await request(app)
      .delete('/admin/projects/' + project.id + '/members/' + patientMember.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(200);

    // Verify the User resource was also deleted
    await expect(systemRepo.readResource<User>('User', user.id)).rejects.toThrow();
  });

  test('Delete server-scoped user membership does not delete User resource', async () => {
    // Register and create a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Delete server-scoped user project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Invite a server-scoped user (Practitioner is server-scoped by default)
    const practitionerEmail = `practitioner${randomUUID()}@example.com`;
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Dr',
        lastName: 'Practitioner',
        email: practitionerEmail,
        scope: 'server',
      });
    expect(res2).toHaveStatus(200);

    // Get the membership
    const membersRes = await request(app)
      .get('/fhir/R4/ProjectMembership')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(membersRes).toHaveStatus(200);
    const members = membersRes.body.entry.map((e: any) => e.resource) as ProjectMembership[];
    const practitionerMember = members.find(
      (m) => m.profile?.reference?.startsWith('Practitioner/') && !m.admin
    ) as ProjectMembership;
    expect(practitionerMember).toBeDefined();

    // Verify the user is server-scoped (no project field)
    const systemRepo = getGlobalSystemRepo();
    const user = await systemRepo.readReference<User>(practitionerMember.user as any);
    expect(user.project).toBeUndefined();

    // Delete the membership
    const res3 = await request(app)
      .delete('/admin/projects/' + project.id + '/members/' + practitionerMember.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(200);

    // Verify the User resource was NOT deleted (still exists)
    const userAfterDelete = await systemRepo.readResource<User>('User', user.id);
    expect(userAfterDelete.id).toBe(user.id);
  });

  test('Save project secrets', async () => {
    // Register and create a project
    const { project, profile, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'John',
        lastName: 'Adams',
        projectName: 'Adams Project',
        email: `john${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Add a secret
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/secrets')
      .set('Authorization', 'Bearer ' + accessToken)
      .send([
        {
          name: 'test_secret',
          valueString: 'test_value',
        },
      ]);
    expect(res2).toHaveStatus(200);

    // Verify the secret was added
    const res3 = await request(app)
      .get('/admin/projects/' + project.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(200);
    expect(res3.body.project.secret).toHaveLength(1);
    expect(res3.body.project.secret[0].name).toStrictEqual('test_secret');
    expect(res3.body.project.secret[0].valueString).toStrictEqual('test_value');

    // Verify the author is set
    const res4 = await request(app)
      .get('/fhir/R4/Project/' + project.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('X-Medplum', 'extended');
    expect(res4).toHaveStatus(200);
    expect(res4.body.meta.author).toMatchObject(createReference(profile));
  });

  test('Save project sites', async () => {
    // Register and create a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'John',
        lastName: 'Adams',
        projectName: 'Adams Project',
        email: `john${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Add a site
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/sites')
      .set('Authorization', 'Bearer ' + accessToken)
      .send([
        {
          name: 'test_site',
          domain: ['example.com'],
        },
      ]);
    expect(res2).toHaveStatus(200);

    // Verify the site was added
    const res3 = await request(app)
      .get('/admin/projects/' + project.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(200);
    expect(res3.body.project.site).toHaveLength(1);
    expect(res3.body.project.site[0].name).toStrictEqual('test_site');
  });

  test('Save project settings', async () => {
    // Register and create a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'John',
        lastName: 'Adams',
        projectName: 'Adams Project',
        email: `john${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Add a setting
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/settings')
      .set('Authorization', 'Bearer ' + accessToken)
      .send([
        {
          name: 'aiModels',
          valueString: JSON.stringify([{ value: 'gpt-5.5', label: 'GPT-5.5' }]),
        },
      ]);
    expect(res2).toHaveStatus(200);

    // Verify the setting was added
    const res3 = await request(app)
      .get('/admin/projects/' + project.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(200);
    expect(res3.body.project.setting).toHaveLength(1);
    expect(res3.body.project.setting[0].name).toStrictEqual('aiModels');
    expect(res3.body.project.setting[0].valueString).toStrictEqual(
      JSON.stringify([{ value: 'gpt-5.5', label: 'GPT-5.5' }])
    );
  });

  test('Set password access denied', async () => {
    // Create test user in project
    const testProjectUser = await addTestUser(testProjectAdmin.project, {
      accessPolicy: {
        resourceType: 'AccessPolicy',
      },
    });

    // Try to set password using user's access token
    const res = await request(app)
      .post('/admin/projects/setpassword')
      .set('Authorization', 'Bearer ' + testProjectUser.accessToken)
      .type('json')
      .send({
        email: 'alice@example.com',
        password: 'password123',
      });

    expect(res).toHaveStatus(403);
  });

  test('Set password missing password', async () => {
    const res = await request(app)
      .post('/admin/projects/setpassword')
      .set('Authorization', 'Bearer ' + testProjectAdmin.accessToken)
      .type('json')
      .send({
        email: 'alice@example.com',
        password: '',
      });

    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Password must be at least 8 characters');
  });

  test('Set password user not found', async () => {
    const res = await request(app)
      .post('/admin/projects/setpassword')
      .set('Authorization', 'Bearer ' + testProjectAdmin.accessToken)
      .type('json')
      .send({
        email: 'user-not-found@example.com',
        password: 'password123',
      });

    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('User not found');
  });

  test('Set password user not associated with project', async () => {
    const testOtherProjectAdmin = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );
    const res = await request(app)
      .post('/admin/projects/setpassword')
      .set('Authorization', 'Bearer ' + testProjectAdmin.accessToken)
      .type('json')
      .send({
        email: testOtherProjectAdmin.user.email,
        password: 'password123',
      });

    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('User not found');
  });

  test('Set password for global scoped user', async () => {
    const res = await request(app)
      .post('/admin/projects/setpassword')
      .set('Authorization', 'Bearer ' + testProjectAdmin.accessToken)
      .type('json')
      .send({
        email: testProjectAdmin.user.email,
        password: 'new-password!@#',
      });

    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('User not found');
  });

  test('Set password for project scoped user', async () => {
    const projectScopedUser = await withTestContext(() =>
      inviteUser({
        project: testProjectAdmin.project,
        resourceType: 'Patient',
        firstName: 'First',
        lastName: 'Last',
        email: `alice${randomUUID()}@example.com`,
      })
    );

    const res = await request(app)
      .post('/admin/projects/setpassword')
      .set('Authorization', 'Bearer ' + testProjectAdmin.accessToken)
      .type('json')
      .send({
        email: projectScopedUser.user.email,
        password: 'new-password!@#',
      });

    expect(res).toHaveStatus(200);
  });

  test('Reset MFA - success', async () => {
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Carol',
        lastName: 'King',
        projectName: 'Carol Project',
        email: `carol${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Invite a member
    const inviteRes = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Dave',
        lastName: 'Lee',
        email: `dave${randomUUID()}@example.com`,
      });
    expect(inviteRes).toHaveStatus(200);

    // inviteRes.body is the ProjectMembership resource directly
    const membershipId = inviteRes.body.id as string;
    const userId = (inviteRes.body.user.reference as string).split('/')[1];

    // Manually mark the user as MFA enrolled via systemRepo (bypassing access policy)
    const systemRepo = getGlobalSystemRepo();
    const invitedUser = await withTestContext(() => systemRepo.readResource<User>('User', userId));
    await withTestContext(() =>
      systemRepo.updateResource<User>({
        ...invitedUser,
        mfaEnrolled: true,
        mfaSecret: 'TESTSECRET',
      })
    );

    // Admin resets MFA
    const resetRes = await request(app)
      .post(`/admin/projects/${project.id}/members/${membershipId}/mfa/reset`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(resetRes).toHaveStatus(200);

    // Verify user is no longer enrolled
    const updatedUser = await withTestContext(() => systemRepo.readResource<User>('User', userId));
    expect(updatedUser.mfaEnrolled).toBe(false);
    // Secret should have been rotated
    expect(updatedUser.mfaSecret).not.toBe('TESTSECRET');
  });

  test('Reset MFA - user not enrolled', async () => {
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Eve',
        lastName: 'Adams',
        projectName: 'Eve Project',
        email: `eve${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const inviteRes = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Frank',
        lastName: 'Mills',
        email: `frank${randomUUID()}@example.com`,
      });
    expect(inviteRes).toHaveStatus(200);

    const membershipId = inviteRes.body.id as string;

    const resetRes = await request(app)
      .post(`/admin/projects/${project.id}/members/${membershipId}/mfa/reset`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(resetRes).toHaveStatus(400);
    expect(resetRes.body.issue[0].details.text).toBe('User is not enrolled in MFA method: totp');
  });

  test('Reset MFA - membership from different project is rejected', async () => {
    const { project: projectA, accessToken: tokenA } = await withTestContext(() =>
      registerNew({
        firstName: 'Grace',
        lastName: 'Hopper',
        projectName: 'Project A',
        email: `grace${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const { project: projectB, accessToken: tokenB } = await withTestContext(() =>
      registerNew({
        firstName: 'Hank',
        lastName: 'Hill',
        projectName: 'Project B',
        email: `hank${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Invite a member to Project B
    const inviteRes = await request(app)
      .post('/admin/projects/' + projectB.id + '/invite')
      .set('Authorization', 'Bearer ' + tokenB)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Ivy',
        lastName: 'Chen',
        email: `ivy${randomUUID()}@example.com`,
      });
    expect(inviteRes).toHaveStatus(200);

    const membershipId = inviteRes.body.id as string;

    // Project A admin tries to reset MFA for Project B member.
    // ctx.repo is scoped to Project A so the membership is not visible → 404.
    const resetRes = await request(app)
      .post(`/admin/projects/${projectA.id}/members/${membershipId}/mfa/reset`)
      .set('Authorization', 'Bearer ' + tokenA)
      .send();
    expect(resetRes).toHaveStatus(404);
  });

  test('Reset MFA - non-admin is rejected', async () => {
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Jack',
        lastName: 'Black',
        projectName: 'Jack Project',
        email: `jack${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const inviteRes = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Karen',
        lastName: 'Page',
        email: `karen${randomUUID()}@example.com`,
      });
    expect(inviteRes).toHaveStatus(200);

    const membershipId = inviteRes.body.id as string;

    // Add a non-admin member to the same project and use their token
    const nonAdminUser = await withTestContext(() => addTestUser(project));

    const resetRes = await request(app)
      .post(`/admin/projects/${project.id}/members/${membershipId}/mfa/reset`)
      .set('Authorization', 'Bearer ' + nonAdminUser.accessToken)
      .send();
    expect(resetRes).toHaveStatus(403);
  });

  test('Reset MFA - invalid method is rejected', async () => {
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Liam',
        lastName: 'Neeson',
        projectName: 'Liam Project',
        email: `liam${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const inviteRes = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Mia',
        lastName: 'Wong',
        email: `mia${randomUUID()}@example.com`,
      });
    expect(inviteRes).toHaveStatus(200);
    const membershipId = inviteRes.body.id as string;

    const resetRes = await request(app)
      .post(`/admin/projects/${project.id}/members/${membershipId}/mfa/reset`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ method: 'sms' });
    expect(resetRes).toHaveStatus(400);
  });

  test('Reset MFA - email method leaves TOTP and secret intact', async () => {
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Nora',
        lastName: 'Stone',
        projectName: 'Nora Project',
        email: `nora${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const inviteRes = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Omar',
        lastName: 'Reed',
        email: `omar${randomUUID()}@example.com`,
      });
    expect(inviteRes).toHaveStatus(200);
    const membershipId = inviteRes.body.id as string;
    const userId = (inviteRes.body.user.reference as string).split('/')[1];

    // Enrolled in both TOTP and email
    const systemRepo = getGlobalSystemRepo();
    const invitedUser = await withTestContext(() => systemRepo.readResource<User>('User', userId));
    await withTestContext(() =>
      systemRepo.updateResource<User>({
        ...invitedUser,
        mfaEnrolled: true,
        mfaMethod: ['totp', 'email'],
        mfaSecret: 'TESTSECRET',
      })
    );

    // Reset only the email method
    const resetRes = await request(app)
      .post(`/admin/projects/${project.id}/members/${membershipId}/mfa/reset`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ method: 'email' });
    expect(resetRes).toHaveStatus(200);

    const updatedUser = await withTestContext(() => systemRepo.readResource<User>('User', userId));
    // Still enrolled in TOTP
    expect(updatedUser.mfaEnrolled).toBe(true);
    expect(updatedUser.mfaMethod).toStrictEqual(['totp']);
    // Email-only reset does not rotate the authenticator secret
    expect(updatedUser.mfaSecret).toBe('TESTSECRET');
  });

  test('Reset MFA - TOTP method leaves email enrolled and rotates secret', async () => {
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Paula',
        lastName: 'Vance',
        projectName: 'Paula Project',
        email: `paula${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const inviteRes = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Quinn',
        lastName: 'Ryder',
        email: `quinn${randomUUID()}@example.com`,
      });
    expect(inviteRes).toHaveStatus(200);
    const membershipId = inviteRes.body.id as string;
    const userId = (inviteRes.body.user.reference as string).split('/')[1];

    const systemRepo = getGlobalSystemRepo();
    const invitedUser = await withTestContext(() => systemRepo.readResource<User>('User', userId));
    await withTestContext(() =>
      systemRepo.updateResource<User>({
        ...invitedUser,
        mfaEnrolled: true,
        mfaMethod: ['totp', 'email'],
        mfaSecret: 'TESTSECRET',
      })
    );

    // Default method is TOTP
    const resetRes = await request(app)
      .post(`/admin/projects/${project.id}/members/${membershipId}/mfa/reset`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(resetRes).toHaveStatus(200);

    const updatedUser = await withTestContext(() => systemRepo.readResource<User>('User', userId));
    // Still enrolled via email
    expect(updatedUser.mfaEnrolled).toBe(true);
    expect(updatedUser.mfaMethod).toStrictEqual(['email']);
    // TOTP reset rotates the secret
    expect(updatedUser.mfaSecret).not.toBe('TESTSECRET');
  });

  test('Reset MFA - method not enrolled is rejected', async () => {
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Rosa',
        lastName: 'Park',
        projectName: 'Rosa Project',
        email: `rosa${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const inviteRes = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Sam',
        lastName: 'Tan',
        email: `sam${randomUUID()}@example.com`,
      });
    expect(inviteRes).toHaveStatus(200);
    const membershipId = inviteRes.body.id as string;
    const userId = (inviteRes.body.user.reference as string).split('/')[1];

    // Enrolled only in TOTP
    const systemRepo = getGlobalSystemRepo();
    const invitedUser = await withTestContext(() => systemRepo.readResource<User>('User', userId));
    await withTestContext(() =>
      systemRepo.updateResource<User>({
        ...invitedUser,
        mfaEnrolled: true,
        mfaMethod: ['totp'],
        mfaSecret: 'TESTSECRET',
      })
    );

    // Try to reset the email method the user is not enrolled in
    const resetRes = await request(app)
      .post(`/admin/projects/${project.id}/members/${membershipId}/mfa/reset`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ method: 'email' });
    expect(resetRes).toHaveStatus(400);
    expect(resetRes.body.issue[0].details.text).toBe('User is not enrolled in MFA method: email');
  });

  test('Reset password - sends email to member', async () => {
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Tara',
        lastName: 'Vale',
        projectName: 'Tara Project',
        email: `tara${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const inviteRes = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Uma',
        lastName: 'West',
        email: `uma${randomUUID()}@example.com`,
        sendEmail: false,
      });
    expect(inviteRes).toHaveStatus(200);
    const membershipId = inviteRes.body.id as string;

    const resetRes = await request(app)
      .post(`/admin/projects/${project.id}/members/${membershipId}/resetpassword`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(resetRes).toHaveStatus(200);
  });

  test('Reset password - non-admin is rejected', async () => {
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Vera',
        lastName: 'York',
        projectName: 'Vera Project',
        email: `vera${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const inviteRes = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Will',
        lastName: 'Xu',
        email: `will${randomUUID()}@example.com`,
      });
    expect(inviteRes).toHaveStatus(200);
    const membershipId = inviteRes.body.id as string;

    const nonAdminUser = await withTestContext(() => addTestUser(project));

    const resetRes = await request(app)
      .post(`/admin/projects/${project.id}/members/${membershipId}/resetpassword`)
      .set('Authorization', 'Bearer ' + nonAdminUser.accessToken)
      .send();
    expect(resetRes).toHaveStatus(403);
  });
});

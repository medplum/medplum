import { createReference } from '@medplum/core';
import { ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { RegisterResponse, registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { addTestUser, setupPwnedPasswordMock, setupRecaptchaMock, withTestContext } from '../test.setup';
import { inviteUser } from './invite';

jest.mock('hibp');
jest.mock('node-fetch');

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
    (fetch as unknown as jest.Mock).mockClear();
    (pwnedPassword as unknown as jest.Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 0);
    setupRecaptchaMock(fetch as unknown as jest.Mock, true);
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
    expect(res2.status).toBe(200);

    // Get the project details
    // Make sure the new member is in the members list
    // Get the project details and members
    // 3 members total (1 admin, 1 client, 1 invited)
    const res3 = await request(app)
      .get('/fhir/R4/ProjectMembership')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('X-Medplum', 'extended');
    expect(res3.status).toBe(200);
    expect(res3.body.entry).toBeDefined();
    expect(res3.body.entry.length).toEqual(3);

    const members = res3.body.entry.map((e: any) => e.resource) as ProjectMembership[];
    const owner = members.find((m) => m.admin);
    expect(owner).toBeDefined();
    const member = members.find((m) => m.id === res2.body.id) as ProjectMembership;
    expect(member).toBeDefined();
    expect(member.meta?.author?.reference).toEqual('system');

    // Get the new membership details
    const res4 = await request(app)
      .get('/admin/projects/' + project.id + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('X-Medplum', 'extended');
    expect(res4.status).toBe(200);
    expect(res4.body.resourceType).toEqual('ProjectMembership');
    expect(res4.body.id).toBeDefined();
    expect(res4.body.meta.project).toEqual(project.id);

    // Try a naughty request using a different resource type
    const res5 = await request(app)
      .post('/admin/projects/' + project.id + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        resourceType: 'Patient',
      });
    expect(res5.status).toBe(403);

    // Try a naughty request using a different membership
    const res6 = await request(app)
      .post('/admin/projects/' + project.id + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        resourceType: 'ProjectMembership',
        id: randomUUID(),
      });
    expect(res6.status).toBe(403);

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
    expect(res7.status).toBe(200);
    expect(res7.body.meta?.author?.reference).toEqual(owner?.profile?.reference);

    // Make sure the new member is an admin
    const res8 = await request(app)
      .get('/fhir/R4/ProjectMembership/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res8.status).toBe(200);
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

    const bobRegistration = await addTestUser(aliceRegistration.project, { resourceType: 'AccessPolicy' });

    // Try to access Alice's project using Alices's access token
    // Should succeed
    const res3 = await request(app)
      .get('/admin/projects/' + aliceRegistration.project.id)
      .set('Authorization', 'Bearer ' + aliceRegistration.accessToken);

    expect(res3.status).toBe(200);

    // Try to access Alice's project members using Alices's access token
    const membersRes = await request(app)
      .get('/fhir/R4/ProjectMembership')
      .set('Authorization', 'Bearer ' + aliceRegistration.accessToken);
    expect(membersRes.status).toBe(200);
    const members = membersRes.body.entry.map((e: any) => e.resource) as ProjectMembership[];

    // Try to access Alice's project using Bob's access token
    // Should fail
    const res4 = await request(app)
      .get('/admin/projects/' + aliceRegistration.project.id)
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken);

    expect(res4.status).toBe(403);

    // Try to access Alice's project members using Bob's access token
    // Should fail
    const res5 = await request(app)
      .get('/admin/projects/' + aliceRegistration.project.id + '/members/' + members[0].id)
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken);

    expect(res5.status).toBe(403);

    // Try to edit Alice's project members using Bob's access token
    // Should fail
    const res6 = await request(app)
      .post('/admin/projects/' + aliceRegistration.project.id + '/members/' + members[0].id)
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken)
      .type('json')
      .send({ resourceType: 'ProjectMembership' });

    expect(res6.status).toBe(403);

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

    expect(res9.status).toBe(201);

    const clientId = res9.body.id;

    // Try to read Alice's client using Alices's access token
    // Should succeed
    const res7 = await request(app)
      .get('/fhir/R4/ClientApplication/' + clientId)
      .set('Authorization', 'Bearer ' + aliceRegistration.accessToken);

    expect(res7.status).toBe(200);

    // Try to read Alice's client using Bob's access token
    // Should fail
    const res8 = await request(app)
      .get('/fhir/R4/ClientApplication/' + clientId)
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken);

    expect(res8.status).toBe(403);

    // Try to create a new client in Alice's project using Bob's access token
    // Should fail
    const res10 = await request(app)
      .post('/admin/projects/' + aliceRegistration.project.id + '/client')
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken);

    expect(res10.status).toBe(403);

    // Try to delete Alice's project members using Bob's access token
    // Should fail
    const res11 = await request(app)
      .delete('/admin/projects/' + aliceRegistration.project.id + '/members/' + members[0].id)
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken);

    expect(res11.status).toBe(403);

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

    expect(res12.status).toBe(403);

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

    expect(res13.status).toBe(403);

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

    expect(res14.status).toBe(403);
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
    expect(res2.status).toBe(200);

    // Get the project details
    // Make sure the new member is in the members list
    // Get the project details and members
    // 3 members total (1 admin, 1 client, 1 invited)
    const res3 = await request(app)
      .get('/admin/projects/' + project.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.body.project).toBeDefined();

    // Try to access Alice's project members using Alices's access token
    const membersRes = await request(app)
      .get('/fhir/R4/ProjectMembership')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(membersRes.status).toBe(200);
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
    expect(res4.status).toBe(200);

    // Now remove Bob as Alice
    // This should succeed
    const res5 = await request(app)
      .delete('/admin/projects/' + project.id + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res5.status).toBe(200);

    // Get the project details
    // Make sure the new member is an admin
    // 2 members total (1 admin, 1 client)
    const res6 = await request(app)
      .get('/admin/projects/' + project.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res6.status).toBe(200);
    expect(res6.body.project).toBeDefined();

    // Alice try to delete her own membership
    // This should fail
    const res7 = await request(app)
      .delete('/admin/projects/' + project.id + '/members/' + owner.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res7.status).toBe(400);
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
    expect(res8.status).toBe(404);
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
    expect(res2.status).toBe(200);

    // Verify the secret was added
    const res3 = await request(app)
      .get('/admin/projects/' + project.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.body.project.secret).toHaveLength(1);
    expect(res3.body.project.secret[0].name).toEqual('test_secret');
    expect(res3.body.project.secret[0].valueString).toEqual('test_value');

    // Verify the author is set
    const res4 = await request(app)
      .get('/fhir/R4/Project/' + project.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('X-Medplum', 'extended');
    expect(res4.status).toBe(200);
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
    expect(res2.status).toBe(200);

    // Verify the site was added
    const res3 = await request(app)
      .get('/admin/projects/' + project.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.body.project.site).toHaveLength(1);
    expect(res3.body.project.site[0].name).toEqual('test_site');
  });

  test('Set password access denied', async () => {
    // Create test user in project
    const testProjectUser = await addTestUser(testProjectAdmin.project, {
      resourceType: 'AccessPolicy',
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

    expect(res.status).toBe(403);
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

    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Invalid password, must be at least 8 characters');
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

    expect(res.status).toBe(400);
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

    expect(res.status).toBe(400);
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

    expect(res.status).toBe(400);
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

    expect(res.status).toBe(200);
  });
});

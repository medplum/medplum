import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { setupPwnedPasswordMock, setupRecaptchaMock } from '../test.setup';

jest.mock('@aws-sdk/client-sesv2');
jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

describe('Project Admin routes', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    (SESv2Client as unknown as jest.Mock).mockClear();
    (SendEmailCommand as unknown as jest.Mock).mockClear();
    (fetch as unknown as jest.Mock).mockClear();
    (pwnedPassword as unknown as jest.Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 0);
    setupRecaptchaMock(fetch as unknown as jest.Mock, true);
  });

  test('Get project and promote admin', async () => {
    // Register and create a project
    const { project, accessToken } = await registerNew({
      firstName: 'John',
      lastName: 'Adams',
      projectName: 'Adams Project',
      email: `john${randomUUID()}@example.com`,
      password: 'password!@#',
    });

    // Invite a new member
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
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
    expect(res3.body.members).toBeDefined();
    expect(res3.body.members.length).toEqual(3);

    const owner = res3.body.members.find((m: any) => m.role === 'owner');
    expect(owner).toBeDefined();
    const member = res3.body.members.find((m: any) => m.role === 'member');
    expect(member).toBeDefined();

    // Get the new membership details
    const res4 = await request(app)
      .get('/admin/projects/' + project.id + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(200);

    // Try a naughty request using a different resource type
    const res5 = await request(app)
      .post('/admin/projects/' + project.id + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        resourceType: 'Patient',
      });
    expect(res5.status).toBe(400);

    // Try a naughty request using a different membership
    const res6 = await request(app)
      .post('/admin/projects/' + project.id + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        resourceType: 'ProjectMembership',
        id: randomUUID(),
      });
    expect(res6.status).toBe(400);

    // Promote the new member to admin
    const res7 = await request(app)
      .post('/admin/projects/' + project.id + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        ...res4.body,
        admin: true,
      });
    expect(res7.status).toBe(200);

    // Get the project details
    // Make sure the new member is an admin
    // 3 members total (1 admin, 1 client, 1 invited)
    const res8 = await request(app)
      .get('/admin/projects/' + project.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res8.status).toBe(200);
    expect(res8.body.project).toBeDefined();
    expect(res8.body.members).toBeDefined();
    expect(res8.body.members.length).toEqual(3);

    const admin = res8.body.members.find((m: any) => m.role === 'admin');
    expect(admin).toBeDefined();
  });

  test('Get project access denied', async () => {
    const aliceRegistration = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });

    const bobRegistration = await registerNew({
      firstName: 'Bob',
      lastName: 'Jones',
      projectName: 'Bob Project',
      email: `bob${randomUUID()}@example.com`,
      password: 'password!@#',
    });

    // Try to access Alice's project using Alices's access token
    // Should succeed
    const res3 = await request(app)
      .get('/admin/projects/' + aliceRegistration.project.id)
      .set('Authorization', 'Bearer ' + aliceRegistration.accessToken);

    expect(res3.status).toBe(200);
    expect(res3.body.members).toBeDefined();
    expect(res3.body.members.length).toEqual(2);
    expect(res3.body.members[0].id).toBeDefined();
    expect(res3.body.members[1].id).toBeDefined();

    // Try to access Alice's project using Bob's access token
    // Should fail
    const res4 = await request(app)
      .get('/admin/projects/' + aliceRegistration.project.id)
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken);

    expect(res4.status).toBe(404);

    // Try to access Alice's project members using Bob's access token
    // Should fail
    const res5 = await request(app)
      .get('/admin/projects/' + aliceRegistration.project.id + '/members/' + res3.body.members[0].id)
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken);

    expect(res5.status).toBe(404);

    // Try to edit Alice's project members using Bob's access token
    // Should fail
    const res6 = await request(app)
      .post('/admin/projects/' + aliceRegistration.project.id + '/members/' + res3.body.members[0].id)
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken)
      .type('json')
      .send({ resourceType: 'ProjectMembership' });

    expect(res6.status).toBe(404);

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

    expect(res8.status).toBe(404);

    // Try to create a new client in Alice's project using Bob's access token
    // Should fail
    const res10 = await request(app)
      .post('/admin/projects/' + aliceRegistration.project.id + '/client')
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken);

    expect(res10.status).toBe(404);

    // Try to delete Alice's project members using Bob's access token
    // Should fail
    const res11 = await request(app)
      .delete('/admin/projects/' + aliceRegistration.project.id + '/members/' + res3.body.members[0].id)
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken);

    expect(res11.status).toBe(404);
  });

  test('Delete membership', async () => {
    // Register and create a project
    const { project, accessToken } = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Delete membership project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });

    // Invite a new member
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
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
    expect(res3.body.members).toBeDefined();
    expect(res3.body.members.length).toEqual(3);

    const owner = res3.body.members.find((m: any) => m.role === 'owner');
    expect(owner).toBeDefined();
    const member = res3.body.members.find((m: any) => m.role === 'member');
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
    expect(res6.body.members).toBeDefined();
    expect(res6.body.members.length).toEqual(2);

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
    const { project, accessToken } = await registerNew({
      firstName: 'John',
      lastName: 'Adams',
      projectName: 'Adams Project',
      email: `john${randomUUID()}@example.com`,
      password: 'password!@#',
    });

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
  });

  test('Save project sites', async () => {
    // Register and create a project
    const { project, accessToken } = await registerNew({
      firstName: 'John',
      lastName: 'Adams',
      projectName: 'Adams Project',
      email: `john${randomUUID()}@example.com`,
      password: 'password!@#',
    });

    // Add a secret
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
});

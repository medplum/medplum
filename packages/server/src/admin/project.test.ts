import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { resolveId } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { setupPwnedPasswordMock, setupRecaptchaMock } from '../jest.setup';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

jest.mock('@aws-sdk/client-sesv2');
jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

describe('Project Admin routes', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);
  });

  afterAll(async () => {
    await closeDatabase();
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
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'John',
        lastName: 'Adams',
        projectName: 'Adams Project',
        email: `john${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'xyz',
      });

    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();

    const projectId = resolveId(res.body.project);

    // Invite a new member
    const res2 = await request(app)
      .post('/admin/projects/' + projectId + '/invite')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
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
      .get('/admin/projects/' + projectId)
      .set('Authorization', 'Bearer ' + res.body.accessToken);
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
      .get('/admin/projects/' + projectId + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + res.body.accessToken);
    expect(res4.status).toBe(200);

    // Try a naughty request using a different resource type
    const res5 = await request(app)
      .post('/admin/projects/' + projectId + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .type('json')
      .send({
        resourceType: 'Patient',
      });
    expect(res5.status).toBe(400);

    // Try a naughty request using a different membership
    const res6 = await request(app)
      .post('/admin/projects/' + projectId + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .type('json')
      .send({
        resourceType: 'ProjectMembership',
        id: randomUUID(),
      });
    expect(res6.status).toBe(400);

    // Promote the new member to admin
    const res7 = await request(app)
      .post('/admin/projects/' + projectId + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + res.body.accessToken)
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
      .get('/admin/projects/' + projectId)
      .set('Authorization', 'Bearer ' + res.body.accessToken);
    expect(res8.status).toBe(200);
    expect(res8.body.project).toBeDefined();
    expect(res8.body.members).toBeDefined();
    expect(res8.body.members.length).toEqual(3);

    const admin = res8.body.members.find((m: any) => m.role === 'admin');
    expect(admin).toBeDefined();
  });

  test('Get project access denied', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'xyz',
      });

    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();

    const res2 = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Bob',
        lastName: 'Jones',
        projectName: 'Bob Project',
        email: `bob${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'xyz',
      });

    expect(res2.status).toBe(200);
    expect(res2.body.project).toBeDefined();
    expect(res2.body.client).toBeDefined();

    const projectId = resolveId(res.body.project);
    const clientId = resolveId(res.body.client);

    // Try to access Alice's project using Alices's access token
    // Should succeed
    const res3 = await request(app)
      .get('/admin/projects/' + projectId)
      .set('Authorization', 'Bearer ' + res.body.accessToken);

    expect(res3.status).toBe(200);
    expect(res3.body.members).toBeDefined();
    expect(res3.body.members.length).toEqual(2);
    expect(res3.body.members[0].id).toBeDefined();
    expect(res3.body.members[1].id).toBeDefined();

    // Try to access Alice's project using Bob's access token
    // Should fail
    const res4 = await request(app)
      .get('/admin/projects/' + projectId)
      .set('Authorization', 'Bearer ' + res2.body.accessToken);

    expect(res4.status).toBe(404);

    // Try to access Alice's project members using Bob's access token
    // Should fail
    const res5 = await request(app)
      .get('/admin/projects/' + projectId + '/members/' + res3.body.members[0].id)
      .set('Authorization', 'Bearer ' + res2.body.accessToken);

    expect(res5.status).toBe(404);

    // Try to edit Alice's project members using Bob's access token
    // Should fail
    const res6 = await request(app)
      .post('/admin/projects/' + projectId + '/members/' + res3.body.members[0].id)
      .set('Authorization', 'Bearer ' + res2.body.accessToken)
      .type('json')
      .send({ resourceType: 'ProjectMembership' });

    expect(res6.status).toBe(404);

    // Try to read Alice's client using Alices's access token
    // Should succeed
    const res7 = await request(app)
      .get('/fhir/R4/ClientApplication/' + clientId)
      .set('Authorization', 'Bearer ' + res.body.accessToken);

    expect(res7.status).toBe(200);

    // Try to read Alice's client using Bob's access token
    // Should fail
    const res8 = await request(app)
      .get('/fhir/R4/ClientApplication/' + clientId)
      .set('Authorization', 'Bearer ' + res2.body.accessToken);

    expect(res8.status).toBe(404);

    // Try to create a new client in Alice's project using Alices's access token
    // Should succeed
    const res9 = await request(app)
      .post('/admin/projects/' + projectId + '/client')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .type('json')
      .send({
        resourceType: 'ClientApplication',
        name: 'Test client',
      });

    expect(res9.status).toBe(201);

    // Try to create a new client in Alice's project using Bob's access token
    // Should fail
    const res10 = await request(app)
      .post('/admin/projects/' + projectId + '/client')
      .set('Authorization', 'Bearer ' + res2.body.accessToken);

    expect(res10.status).toBe(404);

    // Try to delete Alice's project members using Bob's access token
    // Should fail
    const res11 = await request(app)
      .delete('/admin/projects/' + projectId + '/members/' + res3.body.members[0].id)
      .set('Authorization', 'Bearer ' + res2.body.accessToken);

    expect(res11.status).toBe(404);
  });

  test('Delete membership', async () => {
    // Register and create a project
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Delete membership project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'xyz',
      });

    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();

    const projectId = resolveId(res.body.project);

    // Invite a new member
    const res2 = await request(app)
      .post('/admin/projects/' + projectId + '/invite')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
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
      .get('/admin/projects/' + projectId)
      .set('Authorization', 'Bearer ' + res.body.accessToken);
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
      .get('/admin/projects/' + projectId + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + res.body.accessToken);
    expect(res4.status).toBe(200);

    // Now remove Bob as Alice
    // This should succeed
    const res5 = await request(app)
      .delete('/admin/projects/' + projectId + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + res.body.accessToken);
    expect(res5.status).toBe(200);

    // Get the project details
    // Make sure the new member is an admin
    // 2 members total (1 admin, 1 client)
    const res6 = await request(app)
      .get('/admin/projects/' + projectId)
      .set('Authorization', 'Bearer ' + res.body.accessToken);
    expect(res6.status).toBe(200);
    expect(res6.body.project).toBeDefined();
    expect(res6.body.members).toBeDefined();
    expect(res6.body.members.length).toEqual(2);

    // Alice try to delete her own membership
    // This should fail
    const res7 = await request(app)
      .delete('/admin/projects/' + projectId + '/members/' + owner.id)
      .set('Authorization', 'Bearer ' + res.body.accessToken);
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
      .delete('/admin/projects/' + projectId + '/members/' + randomUUID())
      .set('Authorization', 'Bearer ' + res.body.accessToken);
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
});

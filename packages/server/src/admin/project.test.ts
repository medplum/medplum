import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

jest.mock('@aws-sdk/client-sesv2');

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
    (SESv2Client as any).mockClear();
    (SendEmailCommand as any).mockClear();
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
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();

    const projectId = res.body.project.reference.replace('Project/', '');

    // Invite a new member
    const res2 = await request(app)
      .post('/admin/projects/' + projectId + '/invite')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .send({
        firstName: 'Bob',
        lastName: 'Jones',
        email: `bob${randomUUID()}@example.com`
      });

    expect(res2.status).toBe(200);

    // Get the project details
    // Make sure the new member is in the members list
    // Get the project details and members
    const res3 = await request(app)
      .get('/admin/projects/' + projectId)
      .set('Authorization', 'Bearer ' + res.body.accessToken);
    expect(res3.status).toBe(200);
    expect(res3.body.project).toBeDefined();
    expect(res3.body.members).toBeDefined();
    expect(res3.body.members.length).toEqual(2);

    const owner = res3.body.members.find(m => m.role === 'owner');
    expect(owner).toBeDefined();
    const member = res3.body.members.find(m => m.role === 'member');
    expect(member).toBeDefined();

    // Get the new membership details
    const res4 = await request(app)
      .get('/admin/projects/' + projectId + '/members/' + member.membershipId)
      .set('Authorization', 'Bearer ' + res.body.accessToken);
    expect(res4.status).toBe(200);

    // Try a naughty request using a different resource type
    const res5 = await request(app)
      .post('/admin/projects/' + projectId + '/members/' + member.membershipId)
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .type('json')
      .send({
        resourceType: 'Patient'
      });
    expect(res5.status).toBe(400);

    // Try a naughty request using a different membership
    const res6 = await request(app)
      .post('/admin/projects/' + projectId + '/members/' + member.membershipId)
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .type('json')
      .send({
        resourceType: 'ProjectMembership',
        id: randomUUID()
      });
    expect(res6.status).toBe(400);

    // Promote the new member to admin
    const res7 = await request(app)
      .post('/admin/projects/' + projectId + '/members/' + member.membershipId)
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .type('json')
      .send({
        ...res4.body,
        admin: true
      });
    expect(res7.status).toBe(200);

    // Get the project details
    // Make sure the new member is an admin
    const res8 = await request(app)
      .get('/admin/projects/' + projectId)
      .set('Authorization', 'Bearer ' + res.body.accessToken);

    expect(res8.status).toBe(200);
    expect(res8.body.project).toBeDefined();
    expect(res8.body.members).toBeDefined();
    expect(res8.body.members.length).toEqual(2);

    const admin = res8.body.members.find(m => m.role === 'admin');
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
        password: 'password!@#'
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
        password: 'password!@#'
      });

    expect(res2.status).toBe(200);
    expect(res2.body.project).toBeDefined();

    const projectId = res.body.project.reference.replace('Project/', '');

    // Try to access Alice's project using Alices's access token
    // Should succeed
    const res3 = await request(app)
      .get('/admin/projects/' + projectId)
      .set('Authorization', 'Bearer ' + res.body.accessToken);

    expect(res3.status).toBe(200);

    // Try to access Alice's project using Bob's access token
    // Should fail
    const res4 = await request(app)
      .get('/admin/projects/' + projectId)
      .set('Authorization', 'Bearer ' + res2.body.accessToken);

    expect(res4.status).toBe(404);

    // Try to access Alice's project members using Bob's access token
    // Should fail
    const res5 = await request(app)
      .get('/admin/projects/' + projectId + '/members/' + res3.body.members[0].membershipId)
      .set('Authorization', 'Bearer ' + res2.body.accessToken);

    expect(res5.status).toBe(404);

    // Try to edit Alice's project members using Bob's access token
    // Should fail
    const res6 = await request(app)
      .post('/admin/projects/' + projectId + '/members/' + res3.body.members[0].membershipId)
      .set('Authorization', 'Bearer ' + res2.body.accessToken)
      .type('json')
      .send({ resourceType: 'ProjectMembership' });

    expect(res6.status).toBe(404);
  });

});

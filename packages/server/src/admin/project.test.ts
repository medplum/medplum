import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

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

  test('Get projects', async () => {
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
    expect(res.body.project).not.toBeUndefined();

    const res2 = await request(app)
      .get('/admin/projects')
      .set('Authorization', 'Bearer ' + res.body.accessToken);

    expect(res2.status).toBe(200);
    expect(res2.body.projects).not.toBeUndefined();
    expect(res2.body.projects.length).toEqual(1);
  });

  test('Get project', async () => {
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
    expect(res.body.project).not.toBeUndefined();

    const projectId = res.body.project.reference.replace('Project/', '');

    const res2 = await request(app)
      .get('/admin/projects/' + res.body.project.reference.replace('Project/', ''))
      .set('Authorization', 'Bearer ' + res.body.accessToken);

    expect(res2.status).toBe(200);
    expect(res2.body.project).not.toBeUndefined();
    expect(res2.body.members).not.toBeUndefined();
    expect(res2.body.members.length).toEqual(1);

    const res3 = await request(app)
      .get('/admin/projects/' + projectId + '/members/' + res2.body.members[0].membershipId)
      .set('Authorization', 'Bearer ' + res.body.accessToken);

    expect(res3.status).toBe(200);
    expect(res3.body.resourceType).toEqual('ProjectMembership');

    const res4 = await request(app)
      .post('/admin/projects/' + projectId + '/members/' + res2.body.members[0].membershipId)
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .type('json')
      .send(res3.body);

    expect(res4.status).toBe(304);
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
    expect(res.body.project).not.toBeUndefined();

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
    expect(res2.body.project).not.toBeUndefined();

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

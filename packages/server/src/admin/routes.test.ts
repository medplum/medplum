import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

const app = express();

describe('Admin routes', () => {

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
    expect(res.body.project.id).not.toBeUndefined();

    const res2 = await request(app)
      .get('/admin/projects/' + res.body.project.id)
      .set('Authorization', 'Bearer ' + res.body.accessToken);

    expect(res2.status).toBe(200);
    expect(res2.body.project).not.toBeUndefined();
    expect(res2.body.members).not.toBeUndefined();
    expect(res2.body.members.length).toEqual(1);
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

    // Try to access Alice's project using Bob's access token
    // Should fail
    const res3 = await request(app)
      .get('/admin/projects/' + res.body.project.id)
      .set('Authorization', 'Bearer ' + res2.body.accessToken);

    expect(res3.status).toBe(404);
  });

});

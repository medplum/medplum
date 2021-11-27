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

describe('Admin Invite', () => {

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

  test('New user to project', async () => {
    // First, Alice creates a project
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

    // Second, Alice invites Bob to the project
    const res2 = await request(app)
      .post('/admin/projects/' + res.body.project.reference.replace('Project/', '') + '/invite')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .send({
        firstName: 'Bob',
        lastName: 'Jones',
        email: `bob${randomUUID()}@example.com`
      });

    expect(res2.status).toBe(200);
    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);
  });

  test('Existing user to project', async () => {
    // First, Alice creates a project
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

    // Second, Bob creates a project
    const bobEmail = `bob${randomUUID()}@example.com`;
    const res2 = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Bob',
        lastName: 'Jones',
        projectName: 'Bob Project',
        email: bobEmail,
        password: 'password!@#'
      });

    expect(res2.status).toBe(200);
    expect(res2.body.project).not.toBeUndefined();

    // Third, Alice invites Bob to the project
    // Because Bob already has an account, no emails should be sent
    const res3 = await request(app)
      .post('/admin/projects/' + res.body.project.reference.replace('Project/', '') + '/invite')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .send({
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail
      });

    expect(res3.status).toBe(200);
    expect(SESv2Client).not.toHaveBeenCalled();
    expect(SendEmailCommand).not.toHaveBeenCalled();
  });

  test('Access denied', async () => {
    // First, Alice creates a project
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

    // Second, Bob creates a project
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

    // Third, Bob tries to invite Carol to Alice's project
    // In this example, Bob is not an admin of Alice's project
    // So access is denied
    const res3 = await request(app)
      .post('/admin/projects/' + res.body.project.reference.replace('Project/', '') + '/invite')
      .set('Authorization', 'Bearer ' + res2.body.accessToken)
      .send({
        firstName: 'Carol',
        lastName: 'Brown',
        email: `carol${randomUUID()}@example.com`
      });

    expect(res3.status).toBe(404);
    expect(SESv2Client).not.toHaveBeenCalled();
    expect(SendEmailCommand).not.toHaveBeenCalled();
  });

  test('Input validation', async () => {
    // First, Alice creates a project
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

    // Second, Alice invites Bob to the project
    // But she forgets his email address
    // So the request should fail
    const res2 = await request(app)
      .post('/admin/projects/' + res.body.project.reference.replace('Project/', '') + '/invite')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .send({
        firstName: 'Bob',
        lastName: 'Jones',
        email: ''
      });

    expect(res2.status).toBe(400);
    expect(res2.body.issue).not.toBeUndefined();
    expect(SESv2Client).not.toHaveBeenCalled();
    expect(SendEmailCommand).not.toHaveBeenCalled();
  });

});

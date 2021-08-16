import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

const app = express();

describe('Register', () => {

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

  test('Success', done => {
    request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        projectName: 'Hamilton Project',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#'
      })
      .end((err, res) => {
        expect(res.status).toBe(200);
        expect(res.body.user).not.toBeUndefined();
        expect(res.body.profile).not.toBeUndefined();
        expect(res.body.idToken).not.toBeUndefined();
        expect(res.body.accessToken).not.toBeUndefined();
        expect(res.body.refreshToken).not.toBeUndefined();
        done();
      });
  });

  test('Email already registered', done => {
    const registerRequest = {
      firstName: 'George',
      lastName: 'Washington',
      projectName: 'Washington Project',
      email: `george${randomUUID()}@example.com`,
      password: 'password!@#'
    };

    request(app)
      .post('/auth/register')
      .type('json')
      .send(registerRequest)
      .end((err, res) => {
        expect(res.status).toBe(200);
        expect(res.body.user).not.toBeUndefined();
        request(app)
          .post('/auth/register')
          .type('json')
          .send(registerRequest)
          .end((err, res) => {
            expect(res.status).toBe(400);
            expect(res.body.issue[0].details.text).toBe('Email already registered');
            expect(res.body.issue[0].expression[0]).toBe('email');
            done();
          });
      });
  });

});

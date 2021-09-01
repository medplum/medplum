import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { getConfig, loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

jest.mock('jose/jwt/verify', () => {
  const original = jest.requireActual('jose/jwt/verify');
  return {
    ...original,
    jwtVerify: jest.fn(() => ({
      payload: {
        email: 'admin@medplum.com'
      }
    }))
  };
});

const app = express();

describe('Google Auth', () => {

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

  test('Missing client ID', async () => {
    const res = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        clientId: '',
        credential: 'xyz'
      });
    expect(res.status).toBe(400);
    expect(res.body.issue).not.toBeUndefined();
    expect(res.body.issue[0].details.text).toBe('Missing clientId');
  });

  test('Invalid client ID', async () => {
    const res = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        clientId: '123',
        credential: 'xyz'
      });
    expect(res.status).toBe(400);
    expect(res.body.issue).not.toBeUndefined();
    expect(res.body.issue[0].details.text).toBe('Invalid Google Client ID');
  });

  test('Missing credential', async () => {
    const res = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        clientId: getConfig().googleClientId,
        credential: ''
      });
    expect(res.status).toBe(400);
    expect(res.body.issue).not.toBeUndefined();
    expect(res.body.issue[0].details.text).toBe('Missing credential');
  });

  test('Success', async () => {
    const res = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        clientId: getConfig().googleClientId,
        credential: 'xyz'
      });
    expect(res.status).toBe(200);
    expect(res.body.profile).not.toBeUndefined();
    expect(res.body.idToken).not.toBeUndefined();
    expect(res.body.accessToken).not.toBeUndefined();
    expect(res.body.refreshToken).not.toBeUndefined();
  });

});

import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initTestAuth } from '../jest.setup';
import { initKeys } from '../oauth';

const app = express();
let accessToken: string;

describe('Auth middleware', () => {

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await initApp(app);
    await initKeys(config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Get auth success', async () => {
    const res = await request(app)
      .get(`/fhir/R4/metadata`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get no auth header', async () => {
    const res = await request(app)
      .get(`/fhir/R4/metadata`);
    expect(res.status).toBe(401);
  });

  test('Get unrecognized auth header', async () => {
    const res = await request(app)
      .get(`/fhir/R4/metadata`)
      .set('Authorization', 'foo');
    expect(res.status).toBe(401);
  });

  test('Get invalid bearer token', async () => {
    const res = await request(app)
      .get(`/fhir/R4/metadata`)
      .set('Authorization', 'Bearer foo');
    expect(res.status).toBe(401);
  });

});

import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initTestAuth } from '../jest.setup';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

const app = express();
let accessToken: string;

describe('DICOM Routes', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Get studies', async () => {
    const res = await request(app)
      .get(`/dicom/PS3/studies`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Create study', async () => {
    const res = await request(app)
      .post(`/dicom/PS3/studies`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({});
    expect(res.status).toBe(200);
  });

  test('Get study', async () => {
    const res = await request(app)
      .get(`/dicom/PS3/studies/123`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Update study', async () => {
    const res = await request(app)
      .post(`/dicom/PS3/studies/123`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({});
    expect(res.status).toBe(200);
  });

  test('Get rendered study', async () => {
    const res = await request(app)
      .get(`/dicom/PS3/studies/123/rendered`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get all series', async () => {
    const res = await request(app)
      .get(`/dicom/PS3/studies/123/series`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get series', async () => {
    const res = await request(app)
      .get(`/dicom/PS3/studies/123/series/456`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get rendered series', async () => {
    const res = await request(app)
      .get(`/dicom/PS3/studies/123/series/456/rendered`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get series metadata', async () => {
    const res = await request(app)
      .get(`/dicom/PS3/studies/123/series/456/metadata`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get series instances', async () => {
    const res = await request(app)
      .get(`/dicom/PS3/studies/123/series/456/instances`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get instance', async () => {
    const res = await request(app)
      .get(`/dicom/PS3/studies/123/series/456/instances/789`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get rendered instance', async () => {
    const res = await request(app)
      .get(`/dicom/PS3/studies/123/series/456/instances/789/rendered`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get instance metadata', async () => {
    const res = await request(app)
      .get(`/dicom/PS3/studies/123/series/456/instances/789/metadata`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get frame', async () => {
    const res = await request(app)
      .get(`/dicom/PS3/studies/123/series/456/instances/789/frames/0`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get bulk metadata', async () => {
    const res = await request(app)
      .get(`/dicom/PS3/bulkdataUriReference`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });
});

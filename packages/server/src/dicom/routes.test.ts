import { ContentType } from '@medplum/core';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { initTestAuth } from '../test.setup';

const app = express();
let accessToken: string;

describe('DICOM Routes', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
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
      .set('Content-Type', ContentType.JSON)
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
      .set('Content-Type', ContentType.JSON)
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

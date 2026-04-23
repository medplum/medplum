// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference } from '@medplum/core';
import type { Binary, DicomInstance, DicomSeries, DicomStudy } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject } from '../test.setup';

describe('DICOM Routes', () => {
  const app = express();
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    const testProject = await createTestProject({
      withAccessToken: true,
      withRepo: true,
    });

    const repo = testProject.repo;

    const binary = await repo.createResource<Binary>({
      resourceType: 'Binary',
      contentType: ContentType.TEXT,
    });

    const study = await repo.createResource<DicomStudy>({
      resourceType: 'DicomStudy',
      studyInstanceUid: '123',
    });

    const series = await repo.createResource<DicomSeries>({
      resourceType: 'DicomSeries',
      seriesInstanceUid: '456',
      study: createReference(study),
    });

    await repo.createResource<DicomInstance>({
      resourceType: 'DicomInstance',
      sopInstanceUid: '789',
      sopClassUid: '1.2.3',
      study: createReference(study),
      series: createReference(series),
      raw: { reference: 'Binary/123' },
      metadata: '{}',
      pixelData: [createReference(binary)],
    });

    accessToken = testProject.accessToken;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Get studies', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Create study wrong content-type', async () => {
    const res = await request(app)
      .post(`/dicomweb/studies`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({});
    expect(res.status).toBe(415);
  });

  test.skip('Create study success', async () => {
    const boundary = `medplum-${Date.now()}`;
    const contentType = `multipart/related; type=application/dicom; boundary=${boundary}`;
    const body = [`--${boundary}`, 'Content-Type: application/dicom', '', 'foo bar baz quux', `--${boundary}--`].join(
      '\r\n'
    );
    const res = await request(app)
      .post(`/dicomweb/studies`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', contentType)
      .send(body);
    expect(res.status).toBe(200);
  });

  test('Get study', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test.skip('Update study', async () => {
    const res = await request(app)
      .post(`/dicomweb/studies/123`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({});
    expect(res.status).toBe(200);
  });

  test('Get rendered study', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/rendered`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get all series', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get series', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get rendered series', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/rendered`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get series metadata', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/metadata`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get series instances', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get instance', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/789`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get rendered instance', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/789/rendered`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get instance metadata', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/789/metadata`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test.skip('Get frame', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/789/frames/0`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Get bulk metadata', async () => {
    const res = await request(app)
      .get(`/dicomweb/bulkdataUriReference`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });
});

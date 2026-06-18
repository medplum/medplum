// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference } from '@medplum/core';
import type { Binary, DicomInstance, DicomSeries, DicomStudy } from '@medplum/fhirtypes';
import dcmjs from 'dcmjs';
import type { Request, Response } from 'express';
import express from 'express';
import { Readable } from 'node:stream';
import type { Response as SuperAgentResponse } from 'superagent';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { getBinaryStorage } from '../storage/loader';
import { createTestProject } from '../test.setup';
import { handleSearchSeries } from './qido-rs';
import { handleRetrieveInstanceFrame, handleRetrieveSeriesMetadata } from './wado-rs';

// eslint-disable-next-line import/no-named-as-default-member
const { data } = dcmjs;
const { DicomDict, DicomMetaDictionary } = data;

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
      contentType: 'image/jpeg',
    });
    await getBinaryStorage().writeBinary(binary, 'frame.jpg', 'image/jpeg', Readable.from(Buffer.from('frame-1')));
    const unwrittenBinary = await repo.createResource<Binary>({
      resourceType: 'Binary',
      contentType: 'image/jpeg',
    });

    const study = await repo.createResource<DicomStudy>({
      resourceType: 'DicomStudy',
      studyInstanceUid: '123',
      patientName: 'TEST^DICOM',
      patientId: 'P123',
      studyDate: '2024-01-02',
      studyTime: '03:04:05',
    });

    const series = await repo.createResource<DicomSeries>({
      resourceType: 'DicomSeries',
      seriesInstanceUid: '456',
      study: createReference(study),
      seriesNumber: '7',
      modality: 'CT',
    });

    await repo.createResource<DicomInstance>({
      resourceType: 'DicomInstance',
      sopInstanceUid: '789',
      sopClassUid: '1.2.3',
      study: createReference(study),
      series: createReference(series),
      raw: { reference: 'Binary/123' },
      metadata: JSON.stringify({
        '00080016': { vr: 'UI', Value: ['1.2.3'] },
        '00080018': { vr: 'UI', Value: ['789'] },
      }),
      pixelData: [createReference(binary)],
    });

    await repo.createResource<DicomInstance>({
      resourceType: 'DicomInstance',
      sopInstanceUid: '790',
      sopClassUid: '1.2.3',
      study: createReference(study),
      series: createReference(series),
      raw: createReference(binary),
      metadata: '{}',
    });

    await repo.createResource<DicomInstance>({
      resourceType: 'DicomInstance',
      sopInstanceUid: '791',
      sopClassUid: '1.2.3',
      study: createReference(study),
      series: createReference(series),
      raw: createReference(binary),
      metadata: '{}',
      pixelData: [createReference(unwrittenBinary)],
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
    expect(res.headers['content-type']).toContain(ContentType.DICOM_JSON);
  });

  test('Create study wrong content-type', async () => {
    const res = await request(app)
      .post(`/dicomweb/studies`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({});
    expect(res.status).toBe(415);
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
    expect(res.headers['content-type']).toContain(ContentType.DICOM_JSON);
  });

  test('Get all series with unknown study', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/unknown/series`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Study not found' });
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
    expect(res.headers['content-type']).toContain(ContentType.DICOM_JSON);
    expect(res.body).toContainEqual({
      '00080016': { vr: 'UI', Value: ['1.2.3'] },
      '00080018': { vr: 'UI', Value: ['789'] },
    });
  });

  test('Get series metadata with unknown study', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/unknown/series/456/metadata`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Study not found' });
  });

  test('Get series metadata with unknown series', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/unknown/metadata`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Series not found' });
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

  test('Get frame', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/789/frames/1`)
      .set('Authorization', 'Bearer ' + accessToken)
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('multipart/related');
    const body = Buffer.from(res.body).toString();
    expect(body).toContain('Content-Type: image/jpeg');
    expect(body).toContain('frame-1');
  });

  test('Get frame with invalid frame number', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/789/frames/0`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid frame number' });
  });

  test('Get frame with unknown instance', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/unknown/frames/1`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Instance not found' });
  });

  test('Get frame with unknown study', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/unknown/series/456/instances/789/frames/1`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Study not found' });
  });

  test('Get frame with mismatched series', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/unknown/instances/789/frames/1`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Series not found' });
  });

  test('Get frame past available frames', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/789/frames/2`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(416);
    expect(res.body).toMatchObject({ error: 'Requested frame number exceeds total frames available' });
  });

  test('Get frame without pixel data', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/790/frames/1`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Pixel data not found for instance' });
  });

  test('Get frame when pixel data storage is missing', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/791/frames/1`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'Error reading pixel data' });
  });

  test('Get bulk metadata', async () => {
    const res = await request(app)
      .get(`/dicomweb/bulkdataUriReference`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Create study invalid multipart content-type', async () => {
    const res = await request(app)
      .post(`/dicomweb/studies`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'multipart/related')
      .send('bad multipart body');
    expect(res.status).toBe(400);
    expect(res.text).toBe('Error processing DICOM upload');
  });

  test('Create study success', async () => {
    const boundary = `medplum-${Date.now()}`;
    const contentType = `multipart/related; type=application/dicom; boundary=${boundary}`;
    const dicom = createDicomBuffer();
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/dicom\r\n\r\n`),
      dicom,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await request(app)
      .post(`/dicomweb/studies`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', contentType)
      .send(body);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('1.2.840.10008.5.1.4.1.1.7');
    expect(JSON.stringify(res.body)).toContain('1.2.826.0.1.3680043.10.543.1');
  });

  test('Direct handler validation errors', async () => {
    await handleSearchSeries({ params: {} } as Request, createMockResponse(400, { error: 'Invalid study UID' }));
    await handleRetrieveSeriesMetadata(
      { params: { seriesUid: '456' } } as unknown as Request,
      createMockResponse(400, { error: 'Invalid study UID' })
    );
    await handleRetrieveSeriesMetadata(
      { params: { studyUid: '123' } } as unknown as Request,
      createMockResponse(400, { error: 'Invalid series UID' })
    );
    await handleRetrieveInstanceFrame(
      { params: { seriesUid: '456', instanceUid: '789', frame: '1' } } as unknown as Request,
      createMockResponse(400, { error: 'Invalid study UID' })
    );
    await handleRetrieveInstanceFrame(
      { params: { studyUid: '123', instanceUid: '789', frame: '1' } } as unknown as Request,
      createMockResponse(400, { error: 'Invalid series UID' })
    );
    await handleRetrieveInstanceFrame(
      { params: { studyUid: '123', seriesUid: '456', frame: '1' } } as unknown as Request,
      createMockResponse(400, { error: 'Invalid instance UID' })
    );
    await handleRetrieveInstanceFrame(
      { params: { studyUid: '123', seriesUid: '456', instanceUid: '789' } } as unknown as Request,
      createMockResponse(400, { error: 'Invalid frame number' })
    );
  });
});

function createDicomBuffer(): Buffer {
  const elements = {
    _meta: {
      FileMetaInformationVersion: new Uint8Array([0, 1]).buffer,
      MediaStorageSOPClassUID: '1.2.840.10008.5.1.4.1.1.7',
      MediaStorageSOPInstanceUID: '1.2.826.0.1.3680043.10.543.1',
      TransferSyntaxUID: '1.2.840.10008.1.2.1',
      ImplementationClassUID: '1.2.826.0.1.3680043.10.543',
      ImplementationVersionName: 'MEDPLUM',
    },
    SOPClassUID: '1.2.840.10008.5.1.4.1.1.7',
    SOPInstanceUID: '1.2.826.0.1.3680043.10.543.1',
    StudyInstanceUID: '1.2.826.0.1.3680043.10.543.2',
    SeriesInstanceUID: '1.2.826.0.1.3680043.10.543.3',
    StudyID: 'STOW',
    StudyDate: '20240102',
    StudyTime: '030405',
    AccessionNumber: 'A123',
    Modality: 'OT',
    ModalitiesInStudy: ['OT'],
    PatientName: [{ Alphabetic: 'STOW^TEST' }],
    PatientID: 'P-STOW',
    PatientBirthDate: '20000101',
    PatientSex: 'O',
    SeriesNumber: 1,
    InstanceNumber: 1,
    Rows: 1,
    Columns: 1,
    BitsAllocated: 8,
    NumberOfFrames: 1,
  };
  const dicomDict = new DicomDict(DicomMetaDictionary.denaturalizeDataset(elements._meta));
  dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(elements);
  return Buffer.from(dicomDict.write());
}

function binaryParser(res: SuperAgentResponse, callback: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', callback);
}

function createMockResponse(expectedStatus: number, expectedBody: unknown): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  res.json.mockImplementation((body: unknown) => {
    expect(res.status).toHaveBeenCalledWith(expectedStatus);
    expect(body).toEqual(expectedBody);
    return res;
  });
  return res as unknown as Response;
}

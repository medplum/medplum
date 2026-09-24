// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference } from '@medplum/core';
import type { Binary, DicomInstance, DicomSeries, DicomStudy } from '@medplum/fhirtypes';
import dcmjs from 'dcmjs';
import type { Request, Response } from 'express';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Response as SuperAgentResponse } from 'superagent';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { generateAccessToken } from '../oauth/keys';
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
  let projectId: string;
  let issuer: string;
  let getProjectScopedAccessToken: (projectId: string) => Promise<string>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    issuer = config.issuer;

    const testProject = await createTestProject({
      withAccessToken: true,
      withClient: true,
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
    projectId = testProject.project.id;

    const { client, login } = testProject;
    getProjectScopedAccessToken = (scopedProjectId: string) =>
      generateAccessToken(
        {
          login_id: login.id,
          sub: client.id,
          username: client.id,
          client_id: client.id,
          profile: `${client.resourceType}/${client.id}`,
          scope: login.scope as string,
        },
        { issuer: `${issuer}projects/${scopedProjectId}/` }
      );
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Get studies', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
    expect(res.headers['content-type']).toContain(ContentType.DICOM_JSON);
  });

  test('Get studies with /api prefix', async () => {
    const res = await request(app)
      .get(`/api/dicomweb/studies`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
    expect(res.headers['content-type']).toContain(ContentType.DICOM_JSON);
  });

  test('Get studies with project-scoped URL', async () => {
    const scopedAccessToken = await getProjectScopedAccessToken(projectId);
    for (const prefix of [`/projects/${projectId}`, `/api/projects/${projectId}`]) {
      const res = await request(app)
        .get(`${prefix}/dicomweb/studies`)
        .set('Authorization', 'Bearer ' + scopedAccessToken);
      expect(res).toHaveStatus(200);
      expect(res.headers['content-type']).toContain(ContentType.DICOM_JSON);
    }
  });

  test('Cannot use another project scope', async () => {
    const otherProjectId = randomUUID();
    const res = await request(app)
      .get(`/projects/${otherProjectId}/dicomweb/studies`)
      .set('Authorization', 'Bearer ' + (await getProjectScopedAccessToken(otherProjectId)));
    expect(res).toHaveStatus(403);
  });

  test('Create study wrong content-type', async () => {
    const res = await request(app)
      .post(`/dicomweb/studies`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({});
    expect(res).toHaveStatus(415);
  });

  test('Get study', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
  });

  test.skip('Update study', async () => {
    const res = await request(app)
      .post(`/dicomweb/studies/123`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({});
    expect(res).toHaveStatus(200);
  });

  test('Get rendered study', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/rendered`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
  });

  test('Get all series', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
    expect(res.headers['content-type']).toContain(ContentType.DICOM_JSON);
  });

  test('Get all series with unknown study', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/unknown/series`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(404);
    expect(res.body).toMatchObject({ error: 'Study not found' });
  });

  test('Get series', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
  });

  test('Get rendered series', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/rendered`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
  });

  test('Get series metadata', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/metadata`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
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
    expect(res).toHaveStatus(404);
    expect(res.body).toMatchObject({ error: 'Study not found' });
  });

  test('Get series metadata with unknown series', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/unknown/metadata`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(404);
    expect(res.body).toMatchObject({ error: 'Series not found' });
  });

  test('Get series instances', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
  });

  test('Get instance', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/789`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
  });

  test('Get rendered instance', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/789/rendered`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
  });

  test('Get instance metadata', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/789/metadata`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
  });

  test('Get frame', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/789/frames/1`)
      .set('Authorization', 'Bearer ' + accessToken)
      .buffer(true)
      .parse(binaryParser);
    expect(res).toHaveStatus(200);
    expect(res.headers['content-type']).toContain('multipart/related');
    const body = Buffer.from(res.body).toString();
    expect(body).toContain('Content-Type: image/jpeg');
    expect(body).toContain('frame-1');
  });

  test('Get frame with invalid frame number', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/789/frames/0`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject({ error: 'Invalid frame number' });
  });

  test('Get frame with unknown instance', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/unknown/frames/1`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(404);
    expect(res.body).toMatchObject({ error: 'Instance not found' });
  });

  test('Get frame with unknown study', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/unknown/series/456/instances/789/frames/1`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(404);
    expect(res.body).toMatchObject({ error: 'Study not found' });
  });

  test('Get frame with mismatched series', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/unknown/instances/789/frames/1`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(404);
    expect(res.body).toMatchObject({ error: 'Series not found' });
  });

  test('Get frame past available frames', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/789/frames/2`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(416);
    expect(res.body).toMatchObject({ error: 'Requested frame number exceeds total frames available' });
  });

  test('Get frame without pixel data', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/790/frames/1`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(404);
    expect(res.body).toMatchObject({ error: 'Pixel data not found for instance' });
  });

  test('Get frame when pixel data storage is missing', async () => {
    const res = await request(app)
      .get(`/dicomweb/studies/123/series/456/instances/791/frames/1`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(500);
    expect(res.body).toMatchObject({ error: 'Error reading pixel data' });
  });

  test('Get bulk metadata', async () => {
    const res = await request(app)
      .get(`/dicomweb/bulkdataUriReference`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
  });

  test('Create study invalid multipart content-type', async () => {
    const res = await request(app)
      .post(`/dicomweb/studies`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'multipart/related')
      .send('bad multipart body');
    expect(res).toHaveStatus(400);
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
    expect(res).toHaveStatus(200);
    expect(JSON.stringify(res.body)).toContain('1.2.840.10008.5.1.4.1.1.7');
    expect(JSON.stringify(res.body)).toContain('1.2.826.0.1.3680043.10.543.1');

    // The uploaded instance carries no ModalitiesInStudy (0008,0061), so the value below can only
    // come from reconciling the study against its stored series.
    const studies = await request(app)
      .get(`/dicomweb/studies`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(studies).toHaveStatus(200);
    const stored = (studies.body as Record<string, { Value?: unknown[] }>[]).find(
      (study) => study['0020000D']?.Value?.[0] === '1.2.826.0.1.3680043.10.543.2'
    );
    expect(stored?.['00080061'].Value).toStrictEqual(['OT']);
    // Both counts have VR IS, which dcmjs denaturalizes to a string.
    expect(stored?.['00201206'].Value).toStrictEqual(['1']);
    expect(stored?.['00201208'].Value).toStrictEqual(['1']);

    const series = await request(app)
      .get(`/dicomweb/studies/1.2.826.0.1.3680043.10.543.2/series`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(series).toHaveStatus(200);
    // NumberOfSeriesRelatedInstances (0020,1209), also computed rather than sent.
    expect((series.body as Record<string, { Value?: unknown[] }>[])[0]['00201209'].Value).toStrictEqual(['1']);
  });

  test('Create study with multiple instances in one request', async () => {
    // Every instance below shares a study and a series, so their conditional creates all resolve
    // the same two resources. They must be written one at a time: `conditionalCreate` opens a
    // serializable transaction on the connection they share, and overlapping them throws
    // "Repository is in an active transaction".
    const studyInstanceUid = '1.2.826.0.1.3680043.10.543.20';
    const seriesInstanceUid = '1.2.826.0.1.3680043.10.543.21';
    const sopInstanceUids = ['.22', '.23', '.24'].map((suffix) => `1.2.826.0.1.3680043.10.543${suffix}`);

    const boundary = `medplum-${Date.now()}`;
    const contentType = `multipart/related; type=application/dicom; boundary=${boundary}`;
    const body = Buffer.concat([
      ...sopInstanceUids.flatMap((sopInstanceUid, index) => [
        Buffer.from(`--${boundary}\r\nContent-Type: application/dicom\r\n\r\n`),
        createDicomBuffer({ sopInstanceUid, studyInstanceUid, seriesInstanceUid, instanceNumber: index + 1 }),
        Buffer.from('\r\n'),
      ]),
      Buffer.from(`--${boundary}--\r\n`),
    ]);

    const res = await request(app)
      .post(`/dicomweb/studies`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', contentType)
      .send(body);
    expect(res).toHaveStatus(200);

    // Every instance is acknowledged, once each, in the order the request listed them
    const referenced = (res.body as Record<string, { Value?: { '00081155': { Value: string[] } }[] }>)[
      '00081199'
    ].Value?.map((item) => item['00081155'].Value[0]);
    expect(referenced).toStrictEqual(sopInstanceUids);

    // A single study and series absorbed all three, rather than one being created per instance
    const studies = await request(app)
      .get(`/dicomweb/studies`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(studies).toHaveStatus(200);
    const stored = (studies.body as Record<string, { Value?: unknown[] }>[]).filter(
      (study) => study['0020000D']?.Value?.[0] === studyInstanceUid
    );
    expect(stored).toHaveLength(1);
    // Counts have VR IS, which dcmjs denaturalizes to a string.
    expect(stored[0]['00201206'].Value).toStrictEqual(['1']);
    expect(stored[0]['00201208'].Value).toStrictEqual(['3']);

    const series = await request(app)
      .get(`/dicomweb/studies/${studyInstanceUid}/series`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(series).toHaveStatus(200);
    const storedSeries = series.body as Record<string, { Value?: unknown[] }>[];
    expect(storedSeries).toHaveLength(1);
    expect(storedSeries[0]['00201209'].Value).toStrictEqual(['3']);
  });

  test('Re-uploading an instance does not create a duplicate', async () => {
    const studyInstanceUid = '1.2.826.0.1.3680043.10.543.30';
    const seriesInstanceUid = '1.2.826.0.1.3680043.10.543.31';
    const sopInstanceUid = '1.2.826.0.1.3680043.10.543.32';

    async function upload(): Promise<SuperAgentResponse> {
      const boundary = `medplum-${Date.now()}`;
      const contentType = `multipart/related; type=application/dicom; boundary=${boundary}`;
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/dicom\r\n\r\n`),
        createDicomBuffer({ sopInstanceUid, studyInstanceUid, seriesInstanceUid }),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      return request(app)
        .post(`/dicomweb/studies`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', contentType)
        .send(body);
    }

    // Store the same SOP instance twice, in two separate requests
    expect(await upload()).toHaveStatus(200);
    expect(await upload()).toHaveStatus(200);

    // The conditional create resolved the existing instance the second time, so the study and series
    // still count a single instance rather than two. NumberOfStudyRelatedInstances (0020,1208) and
    // NumberOfSeriesRelatedInstances (0020,1209) are recomputed from the stored DicomInstance rows,
    // so a duplicate would show here as '2'.
    const studies = await request(app)
      .get(`/dicomweb/studies`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(studies).toHaveStatus(200);
    const stored = (studies.body as Record<string, { Value?: unknown[] }>[]).filter(
      (study) => study['0020000D']?.Value?.[0] === studyInstanceUid
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]['00201208'].Value).toStrictEqual(['1']);

    const series = await request(app)
      .get(`/dicomweb/studies/${studyInstanceUid}/series`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(series).toHaveStatus(200);
    const storedSeries = series.body as Record<string, { Value?: unknown[] }>[];
    expect(storedSeries).toHaveLength(1);
    expect(storedSeries[0]['00201209'].Value).toStrictEqual(['1']);
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

function createDicomBuffer(overrides?: {
  sopInstanceUid?: string;
  studyInstanceUid?: string;
  seriesInstanceUid?: string;
  instanceNumber?: number;
}): Buffer {
  const sopInstanceUid = overrides?.sopInstanceUid ?? '1.2.826.0.1.3680043.10.543.1';
  const elements = {
    _meta: {
      FileMetaInformationVersion: new Uint8Array([0, 1]).buffer,
      MediaStorageSOPClassUID: '1.2.840.10008.5.1.4.1.1.7',
      MediaStorageSOPInstanceUID: sopInstanceUid,
      TransferSyntaxUID: '1.2.840.10008.1.2.1',
      ImplementationClassUID: '1.2.826.0.1.3680043.10.543',
      ImplementationVersionName: 'MEDPLUM',
    },
    SOPClassUID: '1.2.840.10008.5.1.4.1.1.7',
    SOPInstanceUID: sopInstanceUid,
    StudyInstanceUID: overrides?.studyInstanceUid ?? '1.2.826.0.1.3680043.10.543.2',
    SeriesInstanceUID: overrides?.seriesInstanceUid ?? '1.2.826.0.1.3680043.10.543.3',
    StudyID: 'STOW',
    StudyDate: '20240102',
    StudyTime: '030405',
    AccessionNumber: 'A123',
    Modality: 'OT',
    PatientName: [{ Alphabetic: 'STOW^TEST' }],
    PatientID: 'P-STOW',
    PatientBirthDate: '20000101',
    PatientSex: 'O',
    SeriesNumber: 1,
    // Routinely sent by CT and MR scanners, and stored in elements typed as FHIR date and time,
    // so a STOW request only succeeds if these are reformatted out of their DICOM DA and TM forms
    PerformedProcedureStepStartDate: '20240102',
    PerformedProcedureStepStartTime: '030405.000000',
    InstanceNumber: overrides?.instanceNumber ?? 1,
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
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  res.json.mockImplementation((body: unknown) => {
    expect(res.status).toHaveBeenCalledWith(expectedStatus);
    expect(body).toEqual(expectedBody);
    return res;
  });
  return res as unknown as Response;
}

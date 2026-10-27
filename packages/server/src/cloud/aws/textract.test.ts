// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ComprehendMedicalClient, DetectEntitiesV2Command } from '@aws-sdk/client-comprehendmedical';
import { S3Client } from '@aws-sdk/client-s3';
import {
  GetDocumentTextDetectionCommand,
  StartDocumentTextDetectionCommand,
  TextractClient,
} from '@aws-sdk/client-textract';
import { ContentType } from '@medplum/core';
import type { Binary, Media } from '@medplum/fhirtypes';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

describe('AWS Textract', () => {
  const app = express();
  let mockS3Client: AwsClientStub<S3Client>;
  let mockTextractClient: AwsClientStub<TextractClient>;
  let mockComprehendClient: AwsClientStub<ComprehendMedicalClient>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.binaryStorage = 's3:textract-test';
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    mockS3Client = mockClient(S3Client);

    mockTextractClient = mockClient(TextractClient);

    mockTextractClient.on(StartDocumentTextDetectionCommand).resolves({
      JobId: 'job-1',
    });

    mockTextractClient
      .on(GetDocumentTextDetectionCommand)
      .resolvesOnce({ JobStatus: 'IN_PROGRESS' })
      .resolvesOnce({ JobStatus: 'SUCCEEDED', Blocks: [{ BlockType: 'PAGE' }] });

    mockComprehendClient = mockClient(ComprehendMedicalClient);
    mockComprehendClient.on(DetectEntitiesV2Command).resolvesOnce({});
  });

  afterEach(() => {
    mockS3Client.restore();
    mockTextractClient.restore();
    mockComprehendClient.restore();
  });

  async function getOutputBinary(accessToken: string): Promise<Binary> {
    const searchRes = await request(app)
      .get('/fhir/R4/Media?_sort=-_lastUpdated&_count=1')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(searchRes).toHaveStatus(200);
    const output = searchRes.body.entry[0].resource as Media;
    // content.url is a presigned storage URL of the form /storage/<id>/<versionId>
    const binaryId = new URL(output.content.url as string).pathname.split('/').filter(Boolean)[1];
    const binaryRes = await request(app)
      .get(`/fhir/R4/Binary/${binaryId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Accept', ContentType.FHIR_JSON);
    expect(binaryRes).toHaveStatus(200);
    return binaryRes.body as Binary;
  }

  test('Happy path', async () => {
    const accessToken = await initTestAuth({ project: { features: ['aws-textract'] } });

    const patientRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(patientRes).toHaveStatus(201);
    const patientRef = 'Patient/' + patientRes.body.id;

    // Step 1: Create a PDF Binary
    const res1 = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .set('X-Security-Context', patientRef)
      .send('Hello world');
    expect(res1).toHaveStatus(201);

    // Step 2: Create a Media
    const res2 = await request(app)
      .post('/fhir/R4/Media')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: 'application/pdf',
          url: 'Binary/' + res1.body.id,
        },
      });
    expect(res2).toHaveStatus(201);

    // Step 3: Submit the Media to Textract
    const res3 = await request(app)
      .post(`/fhir/R4/Media/${res2.body.id}/$aws-textract`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(200);
    expect(res3.body.Blocks).toBeDefined();

    const output = await getOutputBinary(accessToken);
    expect(output.securityContext?.reference).toStrictEqual(patientRef);
  });

  test('Paginated results', async () => {
    // Override the shared single-page mock with a two-page (NextToken) sequence
    mockTextractClient.reset();
    mockTextractClient.on(StartDocumentTextDetectionCommand).resolves({ JobId: 'job-1' });
    mockTextractClient
      .on(GetDocumentTextDetectionCommand)
      .resolvesOnce({ JobStatus: 'SUCCEEDED', NextToken: 'page-2', Blocks: [{ BlockType: 'LINE', Text: 'page one' }] })
      .resolvesOnce({ JobStatus: 'SUCCEEDED', Blocks: [{ BlockType: 'LINE', Text: 'page two' }] });

    const accessToken = await initTestAuth({ project: { features: ['aws-textract'] } });

    // Step 1: Create a PDF Binary
    const res1 = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('Hello world');
    expect(res1).toHaveStatus(201);

    // Step 2: Create a Media
    const res2 = await request(app)
      .post('/fhir/R4/Media')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Media',
        status: 'completed',
        content: { contentType: 'application/pdf', url: 'Binary/' + res1.body.id },
      });
    expect(res2).toHaveStatus(201);

    // Step 3: Submit the Media to Textract
    const res3 = await request(app)
      .post(`/fhir/R4/Media/${res2.body.id}/$aws-textract`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(200);

    // All pages of Blocks should be present (fails on buggy code: only "page one" returned)
    const texts = res3.body.Blocks.map((b: { Text?: string }) => b.Text);
    expect(texts).toContain('page one');
    expect(texts).toContain('page two');

    // The reported symptom: the merged result should no longer carry a NextToken
    expect(res3.body.NextToken).toBeUndefined();
  });

  test('Comprehend', async () => {
    const accessToken = await initTestAuth({ project: { features: ['aws-textract'] } });

    // Step 1: Create a PDF Binary
    const res1 = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('Hello world');
    expect(res1).toHaveStatus(201);

    // Step 2: Create a Media
    const res2 = await request(app)
      .post('/fhir/R4/Media')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: 'application/pdf',
          url: 'Binary/' + res1.body.id,
        },
      });
    expect(res2).toHaveStatus(201);

    // Step 3: Submit the Media to Textract
    const res3 = await request(app)
      .post(`/fhir/R4/Media/${res2.body.id}/$aws-textract`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ comprehend: true });
    expect(res3).toHaveStatus(200);
    expect(res3.body.Blocks).toBeDefined();
  });

  test('DocumentReference happy path', async () => {
    const accessToken = await initTestAuth({ project: { features: ['aws-textract'] } });

    // Step 1: Create a PDF Binary
    const res1 = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('Hello world from DocumentReference');
    expect(res1).toHaveStatus(201);

    // Step 2: Create a DocumentReference
    const res2 = await request(app)
      .post('/fhir/R4/DocumentReference')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'DocumentReference',
        status: 'current',
        content: [
          {
            attachment: {
              contentType: 'application/pdf',
              url: 'Binary/' + res1.body.id,
              title: 'Test Document',
            },
          },
        ],
        subject: {
          reference: 'Patient/test-patient',
        },
      });
    expect(res2).toHaveStatus(201);

    // Step 3: Submit the DocumentReference to Textract
    const res3 = await request(app)
      .post(`/fhir/R4/DocumentReference/${res2.body.id}/$aws-textract`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(200);
    expect(res3.body.Blocks).toBeDefined();

    const output = await getOutputBinary(accessToken);
    expect(output.securityContext?.reference).toStrictEqual('DocumentReference/' + res2.body.id);
  });

  test('DocumentReference with Comprehend', async () => {
    const accessToken = await initTestAuth({ project: { features: ['aws-textract'] } });

    // Step 1: Create a PDF Binary
    const res1 = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('Hello world from DocumentReference with Comprehend');
    expect(res1).toHaveStatus(201);

    // Step 2: Create a DocumentReference
    const res2 = await request(app)
      .post('/fhir/R4/DocumentReference')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'DocumentReference',
        status: 'current',
        content: [
          {
            attachment: {
              contentType: 'application/pdf',
              url: 'Binary/' + res1.body.id,
              title: 'Test Document with Comprehend',
            },
          },
        ],
        subject: {
          reference: 'Patient/test-patient',
        },
      });
    expect(res2).toHaveStatus(201);

    // Step 3: Submit the DocumentReference to Textract with Comprehend
    const res3 = await request(app)
      .post(`/fhir/R4/DocumentReference/${res2.body.id}/$aws-textract`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ comprehend: true });
    expect(res3).toHaveStatus(200);
    expect(res3.body.Blocks).toBeDefined();
  });

  test('DocumentReference with no attachment URL', async () => {
    const accessToken = await initTestAuth({ project: { features: ['aws-textract'] } });

    // Create a DocumentReference with content but no attachment URL
    const res1 = await request(app)
      .post('/fhir/R4/DocumentReference')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'DocumentReference',
        status: 'current',
        content: [
          {
            attachment: {
              contentType: 'application/pdf',
              title: 'Test Document without URL',
            },
          },
        ],
        subject: {
          reference: 'Patient/test-patient',
        },
      });
    expect(res1).toHaveStatus(201);

    // Try to submit the DocumentReference to Textract
    const res2 = await request(app)
      .post(`/fhir/R4/DocumentReference/${res1.body.id}/$aws-textract`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(400);
    expect(res2.body.issue[0].details.text).toBe('DocumentReference attachment has no URL');
  });
});

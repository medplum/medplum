import { ComprehendMedicalClient, DetectEntitiesV2Command } from '@aws-sdk/client-comprehendmedical';
import { S3Client } from '@aws-sdk/client-s3';
import {
  GetDocumentTextDetectionCommand,
  StartDocumentTextDetectionCommand,
  TextractClient,
} from '@aws-sdk/client-textract';
import { ContentType } from '@medplum/core';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
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
      .resolvesOnce({ JobStatus: 'SUCCEEDED', Blocks: [] });

    mockComprehendClient = mockClient(ComprehendMedicalClient);
    mockComprehendClient.on(DetectEntitiesV2Command).resolvesOnce({});
  });

  afterEach(() => {
    mockS3Client.restore();
    mockTextractClient.restore();
    mockComprehendClient.restore();
  });

  test('Happy path', async () => {
    const accessToken = await initTestAuth({ project: { features: ['aws-textract'] } });

    // Step 1: Create a PDF Binary
    const res1 = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('Hello world');
    expect(res1.status).toBe(201);

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
    expect(res2.status).toBe(201);

    // Step 3: Submit the Media to Textract
    const res3 = await request(app)
      .post(`/fhir/R4/Media/${res2.body.id}/$aws-textract`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.body.resourceType).toBe('Media');
  });
});

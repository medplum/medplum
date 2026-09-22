// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { GuardDutyClient, SendObjectMalwareScanCommand } from '@aws-sdk/client-guardduty';
import { GetObjectTaggingCommand, NoSuchKey, S3Client } from '@aws-sdk/client-s3';
import type { WithId } from '@medplum/core';
import { ContentType } from '@medplum/core';
import type { Binary, OperationOutcome } from '@medplum/fhirtypes';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { getConfig, loadTestConfig } from '../../config/loader';
import { getBinaryStorageKey } from '../../storage/base';
import { initBinaryStorage } from '../../storage/loader';
import { initTestAuth } from '../../test.setup';
import { MALWARE_SCAN_STATUS_SYSTEM, MALWARE_SCAN_STATUS_TAG, SCAN_REQUESTED } from './binary-scan';

const app = express();
const bucket = 'scan-test';

describe('Binary/$scan', () => {
  let mockS3Client: AwsClientStub<S3Client>;
  let mockGuardDutyClient: AwsClientStub<GuardDutyClient>;
  let accessToken: string;
  let binary: WithId<Binary>;
  let key: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.binaryStorage = 's3:' + bucket;
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(async () => {
    mockS3Client = mockClient(S3Client);
    mockGuardDutyClient = mockClient(GuardDutyClient);
    mockGuardDutyClient.on(SendObjectMalwareScanCommand).resolves({});

    accessToken = await initTestAuth();
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('Hello world');
    expect(res).toHaveStatus(201);
    binary = res.body as WithId<Binary>;
    key = getBinaryStorageKey(binary.id, binary.meta?.versionId);
  });

  afterEach(() => {
    mockS3Client.restore();
    mockGuardDutyClient.restore();
  });

  function mockScanStatus(status: string | undefined): void {
    mockS3Client
      .on(GetObjectTaggingCommand, { Bucket: bucket, Key: key })
      .resolves({ TagSet: status ? [{ Key: MALWARE_SCAN_STATUS_TAG, Value: status }] : [] });
  }

  async function scan(token = accessToken): Promise<request.Response> {
    return request(app)
      .post(`/fhir/R4/Binary/${binary.id}/$scan`)
      .set('Authorization', 'Bearer ' + token)
      .send({});
  }

  function expectScanStatus(res: request.Response, severity: string, code: string, status: string): void {
    expect(res).toHaveStatus(200);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [{ severity, code, details: { coding: [{ system: MALWARE_SCAN_STATUS_SYSTEM, code: status }] } }],
    } as OperationOutcome);
  }

  test('Requests a scan when not yet scanned', async () => {
    mockScanStatus(undefined);

    const res = await scan();
    expectScanStatus(res, 'information', 'informational', SCAN_REQUESTED);
    expect(mockGuardDutyClient.commandCalls(SendObjectMalwareScanCommand)).toHaveLength(1);
    expect(mockGuardDutyClient.commandCalls(SendObjectMalwareScanCommand)[0].args[0].input).toStrictEqual({
      S3Object: { Bucket: bucket, Key: key },
    });
  });

  test.each([
    ['NO_THREATS_FOUND', 'information', 'informational'],
    ['THREATS_FOUND', 'error', 'security'],
    ['UNSUPPORTED', 'warning', 'not-supported'],
  ])('Returns %s without re-scanning', async (status, severity, code) => {
    mockScanStatus(status);

    const res = await scan();
    expectScanStatus(res, severity, code, status);
    expect(mockGuardDutyClient.commandCalls(SendObjectMalwareScanCommand)).toHaveLength(0);
  });

  test.each(['FAILED', 'ACCESS_DENIED'])('Re-scans after %s', async (status) => {
    mockScanStatus(status);

    const res = await scan();
    expectScanStatus(res, 'information', 'informational', SCAN_REQUESTED);
    expect((res.body as OperationOutcome).issue[0].details?.text).toContain(status);
    expect(mockGuardDutyClient.commandCalls(SendObjectMalwareScanCommand)).toHaveLength(1);
  });

  test('Binary without stored content', async () => {
    mockS3Client.on(GetObjectTaggingCommand).rejects(new NoSuchKey({ message: 'Not found', $metadata: {} }));

    const res = await scan();
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Binary has no content to scan');
    expect(mockGuardDutyClient.commandCalls(SendObjectMalwareScanCommand)).toHaveLength(0);
  });

  test('GuardDuty error', async () => {
    mockScanStatus(undefined);
    mockGuardDutyClient.on(SendObjectMalwareScanCommand).rejects(new Error('Bucket is not protected'));

    const res = await scan();
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Bucket is not protected');
  });

  test('Binary in another project', async () => {
    const otherAccessToken = await initTestAuth();

    const res = await scan(otherAccessToken);
    expect(res).toHaveStatus(404);
    expect(mockS3Client.commandCalls(GetObjectTaggingCommand)).toHaveLength(0);
    expect(mockGuardDutyClient.commandCalls(SendObjectMalwareScanCommand)).toHaveLength(0);
  });

  test('Requires S3 storage', async () => {
    initBinaryStorage('file:./binary/');
    try {
      const res = await scan();
      expect(res).toHaveStatus(400);
      expect(res.body.issue[0].details.text).toBe('Malware scanning requires S3 storage');
    } finally {
      initBinaryStorage('s3:' + bucket);
    }
  });

  test('Not supported with SSE-C', async () => {
    const config = getConfig();
    config.sseCustomerKey = 'key';
    try {
      const res = await scan();
      expect(res).toHaveStatus(400);
      expect(res.body.issue[0].details.text).toBe('Malware scanning is not supported with SSE-C encryption');
    } finally {
      config.sseCustomerKey = undefined;
    }
    expect(mockGuardDutyClient.commandCalls(SendObjectMalwareScanCommand)).toHaveLength(0);
  });
});

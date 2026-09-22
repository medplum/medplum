// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { GuardDutyClient, SendObjectMalwareScanCommand } from '@aws-sdk/client-guardduty';
import { GetObjectTaggingCommand, NoSuchKey, PutObjectTaggingCommand, S3Client } from '@aws-sdk/client-s3';
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
import {
  MALWARE_SCAN_PENDING_MS,
  MALWARE_SCAN_REQUESTED_TAG,
  MALWARE_SCAN_STATUS_SYSTEM,
  MALWARE_SCAN_STATUS_TAG,
  SCAN_REQUESTED,
} from './binary-scan';

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

  function mockTags(tags: Record<string, string>): void {
    mockS3Client
      .on(GetObjectTaggingCommand, { Bucket: bucket, Key: key })
      .resolves({ TagSet: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })) });
  }

  function putTagSets(): Record<string, string>[] {
    return mockS3Client
      .commandCalls(PutObjectTaggingCommand)
      .map((call) => Object.fromEntries((call.args[0].input.Tagging?.TagSet ?? []).map((t) => [t.Key, t.Value])));
  }

  function scanRequests(): number {
    return mockGuardDutyClient.commandCalls(SendObjectMalwareScanCommand).length;
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

  test('Marks and requests a scan when not yet scanned', async () => {
    mockTags({ Other: 'keep' });

    const res = await scan();
    expectScanStatus(res, 'information', 'informational', SCAN_REQUESTED);
    expect(mockGuardDutyClient.commandCalls(SendObjectMalwareScanCommand)[0].args[0].input).toStrictEqual({
      S3Object: { Bucket: bucket, Key: key },
    });
    expect(scanRequests()).toBe(1);

    const [tagSet] = putTagSets();
    expect(tagSet).toStrictEqual({ Other: 'keep', [MALWARE_SCAN_REQUESTED_TAG]: expect.any(String) });
    expect(Date.now() - Date.parse(tagSet[MALWARE_SCAN_REQUESTED_TAG])).toBeLessThan(60_000);
  });

  test.each([
    ['NO_THREATS_FOUND', 'information', 'informational'],
    ['THREATS_FOUND', 'error', 'security'],
    ['UNSUPPORTED', 'warning', 'not-supported'],
  ])('Returns %s without re-scanning', async (status, severity, code) => {
    mockTags({ [MALWARE_SCAN_STATUS_TAG]: status, [MALWARE_SCAN_REQUESTED_TAG]: new Date().toISOString() });

    const res = await scan();
    expectScanStatus(res, severity, code, status);
    expect(scanRequests()).toBe(0);
    expect(putTagSets()).toHaveLength(0);
  });

  test('Does not re-send while a requested scan is in progress', async () => {
    mockTags({ [MALWARE_SCAN_REQUESTED_TAG]: new Date(Date.now() - 60_000).toISOString() });

    const res = await scan();
    expectScanStatus(res, 'information', 'informational', SCAN_REQUESTED);
    expect(res.body.issue[0].details.text).toBe('Malware scan in progress');
    expect(scanRequests()).toBe(0);
    expect(putTagSets()).toHaveLength(0);
  });

  test('Re-sends once a requested scan is stale', async () => {
    mockTags({ [MALWARE_SCAN_REQUESTED_TAG]: new Date(Date.now() - MALWARE_SCAN_PENDING_MS - 1).toISOString() });

    const res = await scan();
    expectScanStatus(res, 'information', 'informational', SCAN_REQUESTED);
    expect(scanRequests()).toBe(1);
  });

  test.each(['FAILED', 'ACCESS_DENIED'])('Re-scans after %s, dropping the old status', async (status) => {
    // A status next to the marker was written after it, so the requested scan has finished
    mockTags({
      Other: 'keep',
      [MALWARE_SCAN_STATUS_TAG]: status,
      [MALWARE_SCAN_REQUESTED_TAG]: new Date().toISOString(),
    });

    const res = await scan();
    expectScanStatus(res, 'information', 'informational', SCAN_REQUESTED);
    expect(res.body.issue[0].details.text).toContain(status);
    expect(scanRequests()).toBe(1);
    expect(putTagSets()).toStrictEqual([{ Other: 'keep', [MALWARE_SCAN_REQUESTED_TAG]: expect.any(String) }]);
  });

  test('Binary without stored content', async () => {
    mockS3Client.on(GetObjectTaggingCommand).rejects(new NoSuchKey({ message: 'Not found', $metadata: {} }));

    const res = await scan();
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Binary has no content to scan');
    expect(scanRequests()).toBe(0);
  });

  test('GuardDuty error clears the marker', async () => {
    mockTags({ Other: 'keep', [MALWARE_SCAN_STATUS_TAG]: 'FAILED' });
    mockGuardDutyClient.on(SendObjectMalwareScanCommand).rejects(new Error('Bucket is not protected'));

    const res = await scan();
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Bucket is not protected');
    expect(putTagSets()).toStrictEqual([
      { Other: 'keep', [MALWARE_SCAN_REQUESTED_TAG]: expect.any(String) },
      { Other: 'keep' },
    ]);
  });

  test('GuardDuty error is reported even if clearing the marker fails', async () => {
    mockTags({});
    mockGuardDutyClient.on(SendObjectMalwareScanCommand).rejects(new Error('Bucket is not protected'));
    mockS3Client.on(PutObjectTaggingCommand).resolvesOnce({}).rejects(new Error('Tagging failed'));

    const res = await scan();
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Bucket is not protected');
  });

  test('Binary in another project', async () => {
    const otherAccessToken = await initTestAuth();

    const res = await scan(otherAccessToken);
    expect(res).toHaveStatus(404);
    expect(mockS3Client.commandCalls(GetObjectTaggingCommand)).toHaveLength(0);
    expect(scanRequests()).toBe(0);
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
    expect(scanRequests()).toBe(0);
  });
});

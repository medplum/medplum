// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { GuardDutyClient, SendObjectMalwareScanCommand } from '@aws-sdk/client-guardduty';
import { GetObjectTaggingCommand, NoSuchKey, PutObjectTaggingCommand, S3Client } from '@aws-sdk/client-s3';
import type { WithId } from '@medplum/core';
import { ContentType } from '@medplum/core';
import type { AsyncJob, Binary, OperationOutcome } from '@medplum/fhirtypes';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { getConfig, loadTestConfig } from '../../config/loader';
import { getBinaryStorageKey } from '../../storage/base';
import { initBinaryStorage } from '../../storage/loader';
import { initTestAuth, waitForAsyncJob } from '../../test.setup';
import {
  MALWARE_SCAN_PENDING_MS,
  MALWARE_SCAN_REQUESTED_EXTENSION,
  MALWARE_SCAN_REQUESTED_TAG,
  MALWARE_SCAN_STATUS_SYSTEM,
  MALWARE_SCAN_STATUS_TAG,
  SCAN_REQUESTED,
  scanWait,
} from './binary-scan';

const app = express();
const bucket = 'scan-test';

describe('Binary/$scan', () => {
  let mockS3Client: AwsClientStub<S3Client>;
  let mockGuardDutyClient: AwsClientStub<GuardDutyClient>;
  let accessToken: string;
  let binary: WithId<Binary>;
  let key: string;
  const defaultScanWait = { ...scanWait };

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.binaryStorage = 's3:' + bucket;
    await initApp(app, config);
    Object.assign(scanWait, { pollMs: 1, syncTimeoutMs: 100, asyncTimeoutMs: 100 });
  });

  afterAll(async () => {
    Object.assign(scanWait, defaultScanWait);
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

  // Each GetObjectTagging call returns the next tag set, then the last one repeatedly
  function mockTags(...tagSets: Record<string, string>[]): void {
    const behavior = mockS3Client.on(GetObjectTaggingCommand, { Bucket: bucket, Key: key });
    tagSets.forEach((tags, i) => {
      const output = { TagSet: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })) };
      if (i < tagSets.length - 1) {
        behavior.resolvesOnce(output);
      } else {
        behavior.resolves(output);
      }
    });
  }

  function putTagSets(): Record<string, string>[] {
    return mockS3Client
      .commandCalls(PutObjectTaggingCommand)
      .map((call) => Object.fromEntries((call.args[0].input.Tagging?.TagSet ?? []).map((t) => [t.Key, t.Value])));
  }

  function scanRequests(): number {
    return mockGuardDutyClient.commandCalls(SendObjectMalwareScanCommand).length;
  }

  async function scan(token = accessToken, headers: Record<string, string> = {}): Promise<request.Response> {
    return request(app)
      .post(`/fhir/R4/Binary/${binary.id}/$scan`)
      .set('Authorization', 'Bearer ' + token)
      .set(headers)
      .send({});
  }

  function scanOutcomeMatcher(severity: string, code: string, status: string): OperationOutcome {
    return {
      resourceType: 'OperationOutcome',
      issue: [{ severity, code, details: { coding: [{ system: MALWARE_SCAN_STATUS_SYSTEM, code: status }] } }],
    } as OperationOutcome;
  }

  function requestedAt(res: request.Response): string | undefined {
    return (res.body as OperationOutcome).issue[0].extension?.find((e) => e.url === MALWARE_SCAN_REQUESTED_EXTENSION)
      ?.valueDateTime;
  }

  function expectScanStatus(res: request.Response, severity: string, code: string, status: string): void {
    expect(res).toHaveStatus(200);
    expect(res.body).toMatchObject(scanOutcomeMatcher(severity, code, status));
  }

  test('Requests a scan and waits for the result', async () => {
    const requested = { Other: 'keep', [MALWARE_SCAN_REQUESTED_TAG]: new Date().toISOString() };
    mockTags({ Other: 'keep' }, requested, { ...requested, [MALWARE_SCAN_STATUS_TAG]: 'NO_THREATS_FOUND' });

    const res = await scan();
    expectScanStatus(res, 'information', 'informational', 'NO_THREATS_FOUND');
    expect(mockGuardDutyClient.commandCalls(SendObjectMalwareScanCommand)[0].args[0].input).toStrictEqual({
      S3Object: { Bucket: bucket, Key: key },
    });
    expect(scanRequests()).toBe(1);

    const [tagSet] = putTagSets();
    expect(tagSet).toStrictEqual({ Other: 'keep', [MALWARE_SCAN_REQUESTED_TAG]: expect.any(String) });
    expect(Date.now() - Date.parse(tagSet[MALWARE_SCAN_REQUESTED_TAG])).toBeLessThan(60_000);
    expect(requestedAt(res)).toBe(tagSet[MALWARE_SCAN_REQUESTED_TAG]);
  });

  test.each([
    ['NO_THREATS_FOUND', 'information', 'informational'],
    ['THREATS_FOUND', 'error', 'security'],
    ['UNSUPPORTED', 'warning', 'not-supported'],
  ])('Returns %s without re-scanning', async (status, severity, code) => {
    const scanRequestedAt = new Date(Date.now() - 60_000).toISOString();
    mockTags({ [MALWARE_SCAN_STATUS_TAG]: status, [MALWARE_SCAN_REQUESTED_TAG]: scanRequestedAt });

    const res = await scan();
    expectScanStatus(res, severity, code, status);
    expect(requestedAt(res)).toBe(scanRequestedAt);
    expect(scanRequests()).toBe(0);
    expect(putTagSets()).toHaveLength(0);
  });

  test('Omits the requested time for a result from an automatic scan', async () => {
    mockTags({ [MALWARE_SCAN_STATUS_TAG]: 'NO_THREATS_FOUND' });

    const res = await scan();
    expectScanStatus(res, 'information', 'informational', 'NO_THREATS_FOUND');
    expect(res.body.issue[0].extension).toBeUndefined();
  });

  test('Reports the scan in progress when no result arrives in time', async () => {
    mockTags({});

    const res = await scan();
    expectScanStatus(res, 'information', 'informational', SCAN_REQUESTED);
    expect(res.body.issue[0].details.text).toContain('in progress');
    expect(scanRequests()).toBe(1);
  });

  test('Waits for a scan already in progress without re-sending', async () => {
    const requested = { [MALWARE_SCAN_REQUESTED_TAG]: new Date(Date.now() - 60_000).toISOString() };
    mockTags(requested, { ...requested, [MALWARE_SCAN_STATUS_TAG]: 'THREATS_FOUND' });

    const res = await scan();
    expectScanStatus(res, 'error', 'security', 'THREATS_FOUND');
    expect(scanRequests()).toBe(0);
    expect(putTagSets()).toHaveLength(0);
  });

  test('Returns FAILED when the requested scan fails', async () => {
    const requested = { [MALWARE_SCAN_REQUESTED_TAG]: new Date().toISOString() };
    mockTags({}, requested, { ...requested, [MALWARE_SCAN_STATUS_TAG]: 'FAILED' });

    const res = await scan();
    expectScanStatus(res, 'error', 'exception', 'FAILED');
    expect(scanRequests()).toBe(1);
  });

  test('Re-sends once a requested scan is stale', async () => {
    mockTags({ [MALWARE_SCAN_REQUESTED_TAG]: new Date(Date.now() - MALWARE_SCAN_PENDING_MS - 1).toISOString() });

    const res = await scan();
    expectScanStatus(res, 'information', 'informational', SCAN_REQUESTED);
    expect(scanRequests()).toBe(1);
  });

  test.each(['FAILED', 'ACCESS_DENIED'])('Re-scans after %s, dropping the old status', async (status) => {
    // A status next to the marker was written after it, so the requested scan has finished
    const requested = { Other: 'keep', [MALWARE_SCAN_REQUESTED_TAG]: new Date().toISOString() };
    mockTags({ ...requested, [MALWARE_SCAN_STATUS_TAG]: status }, requested, {
      ...requested,
      [MALWARE_SCAN_STATUS_TAG]: 'NO_THREATS_FOUND',
    });

    const res = await scan();
    expectScanStatus(res, 'information', 'informational', 'NO_THREATS_FOUND');
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

  describe('Prefer: respond-async', () => {
    const preferAsync = { Prefer: 'respond-async' };

    test('Completes an AsyncJob with the result', async () => {
      const requested = { [MALWARE_SCAN_REQUESTED_TAG]: new Date().toISOString() };
      mockTags({}, requested, { ...requested, [MALWARE_SCAN_STATUS_TAG]: 'NO_THREATS_FOUND' });

      const res = await scan(accessToken, preferAsync);
      expect(res).toHaveStatus(202);

      const job = await waitForAsyncJob(res.headers['content-location'], app, accessToken);
      expect(job).toMatchObject<Partial<AsyncJob>>({
        status: 'completed',
        request: expect.stringContaining(`Binary/${binary.id}/$scan`),
        output: {
          resourceType: 'Parameters',
          parameter: [
            { name: 'return', resource: scanOutcomeMatcher('information', 'informational', 'NO_THREATS_FOUND') },
          ],
        },
      });
      expect(scanRequests()).toBe(1);
    });

    test('Fails the AsyncJob when GuardDuty errors', async () => {
      mockTags({});
      mockGuardDutyClient.on(SendObjectMalwareScanCommand).rejects(new Error('Bucket is not protected'));

      const res = await scan(accessToken, preferAsync);
      expect(res).toHaveStatus(202);

      const job = await waitForAsyncJob(res.headers['content-location'], app, accessToken);
      expect(job.status).toBe('error');
    });

    test('Rejects before starting a job when there is nothing to scan', async () => {
      mockS3Client.on(GetObjectTaggingCommand).rejects(new NoSuchKey({ message: 'Not found', $metadata: {} }));

      const res = await scan(accessToken, preferAsync);
      expect(res).toHaveStatus(400);
      expect(scanRequests()).toBe(0);
    });
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

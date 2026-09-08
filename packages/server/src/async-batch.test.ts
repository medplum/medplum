// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Bundle, ProjectSetting } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from './app';
import { loadTestConfig } from './config/loader';
import { createTestProject } from './test.setup';
import type { BatchJobData, LegacyBatchJobData, ReentrantBatchJobData } from './workers/batch';
import { getBatchQueue } from './workers/batch';

describe('Async batch handler', () => {
  const app = express();

  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'batch',
    entry: [{ request: { method: 'POST', url: 'Patient' }, resource: { resourceType: 'Patient' } }],
  };

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  /**
   * Submits an async batch from a project with the given system settings and returns the enqueued
   * job data, whose shape determines which worker path will run it.
   * @param systemSetting - System settings for the submitting project.
   * @returns The job data enqueued on the batch queue.
   */
  async function submitAsyncBatch(systemSetting?: ProjectSetting[]): Promise<BatchJobData> {
    const queue = getBatchQueue() as any;
    queue.add.mockClear();

    const { accessToken } = await createTestProject({
      withAccessToken: true,
      project: { features: ['async-batch'], systemSetting },
    });

    const res = await request(app)
      .post('/fhir/R4/')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Prefer', 'respond-async')
      .send(bundle);
    expect(res).toHaveStatus(202);
    expect(queue.add).toHaveBeenCalledTimes(1);
    return queue.add.mock.calls[0][1] as BatchJobData;
  }

  test('Defaults to re-entrant processing', async () => {
    const jobData = await submitAsyncBatch();
    expect(jobData).toMatchObject<Partial<ReentrantBatchJobData>>({ asyncJobId: expect.any(String) });
    expect(jobData).not.toHaveProperty('bundle');
  });

  test('Uses re-entrant processing when opted in explicitly', async () => {
    const jobData = await submitAsyncBatch([{ name: 'reentrantAsyncBatch', valueBoolean: true }]);
    expect(jobData).toMatchObject<Partial<ReentrantBatchJobData>>({ asyncJobId: expect.any(String) });
    expect(jobData).not.toHaveProperty('bundle');
  });

  test('Uses legacy processing when the setting is false', async () => {
    const jobData = await submitAsyncBatch([{ name: 'reentrantAsyncBatch', valueBoolean: false }]);
    expect(jobData).toMatchObject<Partial<LegacyBatchJobData>>({
      asyncJob: expect.objectContaining({ resourceType: 'AsyncJob' }),
      bundle,
    });
  });
});

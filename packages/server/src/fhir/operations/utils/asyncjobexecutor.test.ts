// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import type { AsyncJob, Parameters } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../../../app';
import { loadTestConfig } from '../../../config/loader';
import { createTestProject, waitForAsyncJob, withTestContext } from '../../../test.setup';
import { getTestProjectSystemRepo } from '../../repository/test-utils';
import { AsyncJobExecutor } from './asyncjobexecutor';

describe('AsyncJobExecutor', () => {
  const app = express();
  const systemRepo = getTestProjectSystemRepo();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('init', () =>
    withTestContext(async () => {
      const exec = new AsyncJobExecutor(systemRepo);

      const resource = await exec.init('http://example.com/async');

      expect(resource.status).toBe('accepted');
    }));

  test('start', () =>
    withTestContext(async () => {
      const testProject = await createTestProject({ withAccessToken: true, withRepo: true });
      const exec = new AsyncJobExecutor(testProject.repo);

      const resource = await exec.init('http://example.com/async');
      const callback = vi.fn();

      exec.start(async () => {
        callback();
      });

      expect(resource.status).toBe('accepted');
      expect(callback).toHaveBeenCalled();

      await waitForAsyncJob(exec.getContentLocation('http://example.com/'), app, testProject.accessToken);
    }));

  test('start with error', () =>
    withTestContext(async () => {
      const exec = new AsyncJobExecutor(systemRepo);

      const callback = vi.fn();

      try {
        exec.start(async () => {
          callback();
        });
      } catch (err) {
        expect((err as Error).message).toBe('AsyncJob missing');
      }

      expect(callback).not.toHaveBeenCalled();
    }));

  test('run', () =>
    withTestContext(async () => {
      const exec = new AsyncJobExecutor(systemRepo);

      const resource = await exec.init('http://example.com/async');
      const callback = vi.fn();

      await exec.run(async () => {
        callback();
      });

      expect(resource.status).toBe('accepted');
      expect(callback).toHaveBeenCalled();
    }));

  test('run with error', async () => {
    const exec = new AsyncJobExecutor(systemRepo);

    const callback = vi.fn();

    try {
      await exec.run(async () => {
        callback();
      });
    } catch (err) {
      expect((err as Error).message).toBe('AsyncJob missing');
    }

    expect(callback).not.toHaveBeenCalled();
  });

  test.each(['completeJob', 'failJob'] as const)('%s keeps the requester as an account of the AsyncJob', (method) =>
    withTestContext(async () => {
      const { client, repo } = await createTestProject({
        withClient: true,
        withRepo: true,
        extendedMode: false,
        accessPolicy: {
          compartment: { reference: 'Organization/' + randomUUID() },
          resource: [{ resourceType: 'AsyncJob', criteria: 'AsyncJob?_compartment=%profile' }],
        },
      });
      const exec = new AsyncJobExecutor(repo);
      const { id } = await exec.init('http://example.com/async');

      const output: Parameters = { resourceType: 'Parameters', parameter: [{ name: 'result', valueString: 'test' }] };
      const finishedJob = await (method === 'completeJob' ? exec.completeJob(output) : exec.failJob(undefined, output));

      expect(finishedJob.meta?.accounts).toStrictEqual([
        repo.effectiveAccessPolicy()?.compartment,
        { reference: getReferenceString(client) },
      ]);
      await expect(repo.readResource('AsyncJob', id)).resolves.toMatchObject({ status: finishedJob.status, output });
    })
  );

  test('getContentLocation', () =>
    withTestContext(async () => {
      const exec = new AsyncJobExecutor(systemRepo);
      const baseUrl = 'http://testbaseurl';

      const resource = await exec.init('http://example.com/async');

      const contentLocation = exec.getContentLocation(baseUrl);

      expect(resource.status).toBe('accepted');
      expect(contentLocation).toContain(baseUrl);
      expect(contentLocation).toContain(resource.id);
    }));

  test('failJob leaves a job that is no longer active unchanged', () =>
    withTestContext(async () => {
      const cancelled = await systemRepo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'cancelled',
        requestTime: new Date().toISOString(),
        request: 'http://example.com/async',
      });

      const result = await new AsyncJobExecutor(systemRepo, cancelled).failJob(new Error('boom'));
      expect(result.status).toBe('cancelled');

      const refreshed = await systemRepo.readResource<AsyncJob>('AsyncJob', cancelled.id);
      expect(refreshed.status).toBe('cancelled');
      assert(refreshed.meta?.versionId);
      expect(refreshed.meta.versionId).toStrictEqual(cancelled.meta?.versionId);
    }));

  test('getContentLocation with error', async () => {
    const exec = new AsyncJobExecutor(systemRepo);

    const callback = vi.fn();

    try {
      exec.getContentLocation('http://localhost');
    } catch (err) {
      expect((err as Error).message).toBe('AsyncJob missing');
    }

    expect(callback).not.toHaveBeenCalled();
  });
});

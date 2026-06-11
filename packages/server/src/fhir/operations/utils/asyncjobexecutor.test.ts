// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'crypto';
import express from 'express';
import { initApp, shutdownApp } from '../../../app';
import { loadTestConfig } from '../../../config/loader';
import { createTestProject, waitForAsyncJob, withTestContext } from '../../../test.setup';
import { getGlobalSystemRepo, Repository } from '../../repo';
import { AsyncJobExecutor } from './asyncjobexecutor';
import { vi } from 'vitest';

describe('AsyncJobExecutor', () => {
  const app = express();
  const systemRepo = getGlobalSystemRepo();

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
      const testProject = await createTestProject({ withAccessToken: true });
      const exec = new AsyncJobExecutor(
        new Repository({
          projects: [testProject.project],
          author: { reference: 'User/' + randomUUID() },
        })
      );

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

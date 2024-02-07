import express from 'express';
import { initApp, shutdownApp } from '../../../app';
import { loadTestConfig } from '../../../config';
import { withTestContext } from '../../../test.setup';
import { getSystemRepo } from '../../repo';
import { AsyncJobExecutor } from './asyncjobexecutor';

describe('AsyncJobExecutor', () => {
  const app = express();
  const systemRepo = getSystemRepo();

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
      const exec = new AsyncJobExecutor(systemRepo);

      const resource = await exec.init('http://example.com/async');
      const callback = jest.fn();

      exec.start(async () => {
        callback();
      });

      expect(resource.status).toBe('accepted');
      expect(callback).toHaveBeenCalled();
    }));

  test('start with error', () =>
    withTestContext(async () => {
      const exec = new AsyncJobExecutor(systemRepo);

      const callback = jest.fn();

      try {
        await exec.start(async () => {
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
      const callback = jest.fn();

      await exec.run(async () => {
        callback();
      });

      expect(resource.status).toBe('accepted');
      expect(callback).toHaveBeenCalled();
    }));

  test('run with error', async () => {
    const exec = new AsyncJobExecutor(systemRepo);

    const callback = jest.fn();

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

    const callback = jest.fn();

    try {
      exec.getContentLocation('http://localhost');
    } catch (err) {
      expect((err as Error).message).toBe('AsyncJob missing');
    }

    expect(callback).not.toHaveBeenCalled();
  });
});

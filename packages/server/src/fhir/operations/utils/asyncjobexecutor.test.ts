import express from 'express';
import { systemRepo } from '../../repo';
import { AsyncJobExecutor } from './asyncjobexecutor';
import { initApp, shutdownApp } from '../../../app';
import { loadTestConfig } from '../../../config';

const app = express();

describe('AsyncJobExecutor', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('start', async () => {
    const exec = new AsyncJobExecutor(systemRepo);

    const resource = await exec.start('http://example.com/async');

    expect(resource.status).toBe('accepted');
  });

  test('run', async () => {
    const exec = new AsyncJobExecutor(systemRepo);

    const resource = await exec.start('http://example.com/async');
    const callback = jest.fn();

    await exec.run(async () => {
      callback();
    });

    expect(resource.status).toBe('accepted');
    expect(callback).toBeCalled();
  });

  test('getContentLocation', async () => {
    const exec = new AsyncJobExecutor(systemRepo);
    const baseUrl = 'http://testbaseurl';

    const resource = await exec.start('http://example.com/async');

    const contentLocation = exec.getContentLocation(baseUrl);

    expect(resource.status).toBe('accepted');
    expect(contentLocation).toContain(baseUrl);
    expect(contentLocation).toContain(resource.id);
  });

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

    expect(callback).not.toBeCalled();
  });

  test('getContentLocation with error', async () => {
    const exec = new AsyncJobExecutor(systemRepo);

    const callback = jest.fn();

    try {
      exec.getContentLocation('http://localhost');
    } catch (err) {
      expect((err as Error).message).toBe('AsyncJob missing');
    }

    expect(callback).not.toBeCalled();
  });
});

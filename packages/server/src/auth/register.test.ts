import { randomUUID } from 'crypto';
import express from 'express';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { registerNew } from './register';
import { withTestContext } from '../test.setup';

const app = express();

describe('Register', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success', () =>
    withTestContext(async () => {
      const result = await registerNew({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        projectName: 'Hamilton Project',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#',
      });

      expect(result.profile).toBeDefined();
      expect(result.accessToken).toBeDefined();
    }));
});

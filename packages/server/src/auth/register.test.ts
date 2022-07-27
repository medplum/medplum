import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initKeys } from '../oauth';
import { closeRedis, initRedis } from '../redis';
import { seedDatabase } from '../seed';
import { setupPwnedPasswordMock, setupRecaptchaMock } from '../test.setup';
import { registerNew } from './register';

jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

describe('Register', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    initRedis(config.redis);
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);
  });

  afterAll(async () => {
    await closeDatabase();
    closeRedis();
  });

  beforeEach(async () => {
    (fetch as unknown as jest.Mock).mockClear();
    (pwnedPassword as unknown as jest.Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 0);
    setupRecaptchaMock(fetch as unknown as jest.Mock, true);
  });

  test('Success', async () => {
    const result = await registerNew({
      firstName: 'Alexander',
      lastName: 'Hamilton',
      projectName: 'Hamilton Project',
      email: `alex${randomUUID()}@example.com`,
      password: 'password!@#',
    });

    expect(result.profile).toBeDefined();
    expect(result.accessToken).toBeDefined();
  });
});

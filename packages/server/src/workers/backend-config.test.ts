// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { loadConfig } from '../config/loader';

describe('background job configuration', () => {
  const dir = mkdtempSync(join(tmpdir(), 'medplum-jobs-config-'));
  const configPath = join(dir, 'config.json');

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  async function load(backgroundJobs: unknown): ReturnType<typeof loadConfig> {
    writeFileSync(configPath, JSON.stringify({ baseUrl: 'http://localhost:3000', backgroundJobs }));
    return loadConfig(`file:${configPath}`);
  }

  test('preserves the default Redis configuration and accepts an explicit Redis backend', async () => {
    expect((await load(undefined)).backgroundJobs).toBeUndefined();
    expect((await load({ backend: 'redis' })).backgroundJobs).toEqual({ backend: 'redis' });
  });

  test('accepts PostgreSQL connection settings', async () => {
    const backgroundJobs = {
      backend: 'postgres',
      postgres: { connectionString: 'postgres://localhost/jobs', maxConnections: 4 },
    };
    expect((await load(backgroundJobs)).backgroundJobs).toEqual(backgroundJobs);
  });

  test('loads PostgreSQL settings from the environment', async () => {
    const backgroundJobs = { backend: 'postgres', postgres: { connectionString: 'postgres://localhost/jobs' } };
    try {
      vi.stubEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
      vi.stubEnv('MEDPLUM_BACKGROUND_JOBS', JSON.stringify(backgroundJobs));
      expect((await loadConfig('env')).backgroundJobs).toEqual(backgroundJobs);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test.each([
    [null, 'backend'],
    [{ backend: 'invalid' }, 'backend'],
    [{ backend: 'postgres' }, 'connectionString'],
    [{ backend: 'postgres', postgres: { connectionString: '  ' } }, 'connectionString'],
    [
      { backend: 'postgres', postgres: { connectionString: 'postgres://localhost/jobs', maxConnections: 1 } },
      'maxConnections',
    ],
    [
      { backend: 'postgres', postgres: { connectionString: 'postgres://localhost/jobs', maxConnections: 2.5 } },
      'maxConnections',
    ],
  ])('rejects invalid settings %#', async (backgroundJobs, message) => {
    await expect(load(backgroundJobs)).rejects.toThrow(message);
  });
});

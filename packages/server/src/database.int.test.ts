// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import type { PoolClient } from 'pg';
import { loadTestConfig } from './config/loader';
import {
  acquireAdvisoryLock,
  closeDatabase,
  DatabaseMode,
  getDatabasePool,
  initDatabase,
  releaseAdvisoryLock,
} from './database';

describe('Advisory locks', () => {
  let clientA: PoolClient;
  let clientB: PoolClient;

  beforeEach(async () => {
    const config = await loadTestConfig();
    await initDatabase(config);
    const pool = getDatabasePool(DatabaseMode.READER);
    clientA = await pool.connect();
    clientB = await pool.connect();
    await clientA.query(`SET statement_timeout TO 100`);
    await clientB.query(`SET statement_timeout TO 100`);
  });

  afterEach(async () => {
    clientA.release();
    clientB.release();
    await closeDatabase();
  });

  test('Acquire', async () => {
    const aLock = await acquireAdvisoryLock(clientA, 123, { maxAttempts: 1, retryDelayMs: 10 });
    const bLock = await acquireAdvisoryLock(clientB, 123, { maxAttempts: 1, retryDelayMs: 10 });

    expect(aLock).toBe(true);
    expect(bLock).toBe(false);
  });

  test('Acquire and release', async () => {
    const aLock = await acquireAdvisoryLock(clientA, 123, { maxAttempts: 1, retryDelayMs: 10 });
    expect(aLock).toBe(true);

    let bLock: boolean = false;
    const aPromise = async (): Promise<void> => {
      await sleep(10);
      return releaseAdvisoryLock(clientA, 123);
    };
    const bPromise = async (): Promise<void> => {
      bLock = await acquireAdvisoryLock(clientB, 123, { maxAttempts: 2, retryDelayMs: 20 });
    };

    await Promise.all([aPromise(), bPromise()]);

    expect(bLock).toBe(true);
  });
});

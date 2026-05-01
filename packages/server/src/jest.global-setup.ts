// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Redis from 'ioredis';
import { loadTestConfig } from './config/loader';

const TEST_REDIS_FLUSH_DBS_ENV = 'MEDPLUM_TEST_REDIS_FLUSH_DBS';
const defaultRedisDbsToFlush = [6, 7, 8, 9, 10];

export default async function globalSetup(): Promise<void> {
  await flushRedisDbs(getRedisDbsToFlush(process.env[TEST_REDIS_FLUSH_DBS_ENV]));
}

export function getRedisDbsToFlush(value: string | undefined): number[] {
  if (value === undefined) {
    return defaultRedisDbsToFlush;
  }

  if (!value.trim()) {
    return [];
  }

  const result: number[] = [];
  for (const part of value.split(',')) {
    const db = Number.parseInt(part.trim(), 10);
    if (db >= 0 && db <= 15) {
      result.push(db);
    } else {
      throw new Error(`Invalid Redis database number "${part.trim()}" in ${TEST_REDIS_FLUSH_DBS_ENV}`);
    }
  }
  return result;
}

async function flushRedisDbs(dbs: number[]): Promise<void> {
  const config = await loadTestConfig();
  console.info('Flushing Redis databases:', dbs);
  for (const db of dbs) {
    const redis = new Redis({ ...config.redis, db, lazyConnect: true });
    try {
      await redis.connect();
      await redis.flushdb();
    } finally {
      redis.disconnect();
    }
  }
}

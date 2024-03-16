import { MEDPLUM_VERSION } from '@medplum/core';
import { Request, Response } from 'express';
import { getHeapStatistics } from 'v8';
import { getDatabasePool } from './database';
import { getRedis } from './redis';

export async function healthcheckHandler(_req: Request, res: Response): Promise<void> {
  const heapStats = getHeapStatistics();
  res.json({
    ok: true,
    version: MEDPLUM_VERSION,
    platform: process.platform,
    runtime: process.version,
    heapSize: heapStats.heap_size_limit,
    postgres: await testPostgres(),
    redis: await testRedis(),
  });
}

async function testPostgres(): Promise<boolean> {
  return (await getDatabasePool().query(`SELECT 1 AS "status"`)).rows[0].status === 1;
}

async function testRedis(): Promise<boolean> {
  return (await getRedis().ping()) === 'PONG';
}

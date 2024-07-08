import { MEDPLUM_VERSION } from '@medplum/core';
import { Request, Response } from 'express';
import os from 'node:os';
import v8 from 'node:v8';
import { Pool } from 'pg';
import { DatabaseMode, getDatabasePool } from './database';
import { RecordMetricOptions, setGauge } from './otel/otel';
import { getRedis } from './redis';

const hostname = os.hostname();
const BASE_METRIC_OPTIONS = { attributes: { hostname } } satisfies RecordMetricOptions;
const METRIC_IN_SECS_OPTIONS = { ...BASE_METRIC_OPTIONS, options: { unit: 's' } } satisfies RecordMetricOptions;

export async function healthcheckHandler(_req: Request, res: Response): Promise<void> {
  const pool = getDatabasePool(DatabaseMode.WRITER);

  setGauge('medplum.db.idleConnections', pool.idleCount, BASE_METRIC_OPTIONS);
  setGauge('medplum.db.queriesAwaitingClient', pool.waitingCount, BASE_METRIC_OPTIONS);

  let startTime = Date.now();
  const postgresOk = await testPostgres(pool);
  const dbRoundtripMs = Date.now() - startTime;
  setGauge('medplum.db.healthcheckRTT', dbRoundtripMs / 1000, METRIC_IN_SECS_OPTIONS);

  startTime = Date.now();
  const redisOk = await testRedis();
  const redisRoundtripMs = Date.now() - startTime;
  setGauge('medplum.redis.healthcheckRTT', redisRoundtripMs / 1000, METRIC_IN_SECS_OPTIONS);

  const heapStats = v8.getHeapStatistics();
  setGauge('medplum.node.usedHeapSize', heapStats.used_heap_size, BASE_METRIC_OPTIONS);

  const heapSpaceStats = v8.getHeapSpaceStatistics();
  setGauge(
    'medplum.node.oldSpaceUsedSize',
    heapSpaceStats.find((entry) => entry.space_name === 'old_space')?.space_used_size ?? -1,
    BASE_METRIC_OPTIONS
  );
  setGauge(
    'medplum.node.newSpaceUsedSize',
    heapSpaceStats.find((entry) => entry.space_name === 'new_space')?.space_used_size ?? -1,
    BASE_METRIC_OPTIONS
  );

  res.json({
    ok: true,
    version: MEDPLUM_VERSION,
    platform: process.platform,
    runtime: process.version,
    postgres: postgresOk,
    redis: redisOk,
  });
}

async function testPostgres(pool: Pool): Promise<boolean> {
  return (await pool.query(`SELECT 1 AS "status"`)).rows[0].status === 1;
}

async function testRedis(): Promise<boolean> {
  return (await getRedis().ping()) === 'PONG';
}

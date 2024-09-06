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
  const writerPool = getDatabasePool(DatabaseMode.WRITER);
  const readerPool = getDatabasePool(DatabaseMode.READER);

  setGauge('medplum.db.idleConnections', writerPool.idleCount, {
    ...BASE_METRIC_OPTIONS,
    attributes: { ...BASE_METRIC_OPTIONS.attributes, dbInstanceType: 'writer' },
  });
  setGauge('medplum.db.queriesAwaitingClient', writerPool.waitingCount, {
    ...BASE_METRIC_OPTIONS,
    attributes: { ...BASE_METRIC_OPTIONS.attributes, dbInstanceType: 'writer' },
  });

  if (writerPool !== readerPool) {
    setGauge('medplum.db.idleConnections', readerPool.idleCount, {
      ...BASE_METRIC_OPTIONS,
      attributes: { ...BASE_METRIC_OPTIONS.attributes, dbInstanceType: 'reader' },
    });
    setGauge('medplum.db.queriesAwaitingClient', readerPool.waitingCount, {
      ...BASE_METRIC_OPTIONS,
      attributes: { ...BASE_METRIC_OPTIONS.attributes, dbInstanceType: 'reader' },
    });
  }

  let startTime = Date.now();
  const postgresWriterOk = await testPostgres(writerPool);
  const writerRoundtripMs = Date.now() - startTime;
  setGauge('medplum.db.healthcheckRTT', writerRoundtripMs / 1000, {
    ...METRIC_IN_SECS_OPTIONS,
    attributes: { ...METRIC_IN_SECS_OPTIONS.attributes, dbInstanceType: 'writer' },
  });

  if (writerPool !== readerPool) {
    startTime = Date.now();
    await testPostgres(readerPool);
    const readerRoundtripMs = Date.now() - startTime;
    setGauge('medplum.db.healthcheckRTT', readerRoundtripMs / 1000, {
      ...METRIC_IN_SECS_OPTIONS,
      attributes: { ...METRIC_IN_SECS_OPTIONS.attributes, dbInstanceType: 'reader' },
    });
  }

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
    postgres: postgresWriterOk,
    redis: redisOk,
  });
}

async function testPostgres(pool: Pool): Promise<boolean> {
  return (await pool.query(`SELECT 1 AS "status"`)).rows[0].status === 1;
}

async function testRedis(): Promise<boolean> {
  return (await getRedis().ping()) === 'PONG';
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MEDPLUM_VERSION } from '@medplum/core';
import type { Request, Response } from 'express';
import os from 'node:os';
import type { PoolClient } from 'pg';
import { DatabaseMode, getDatabasePool } from './database';
import type { RecordMetricOptions } from './otel/otel';
import { setGauge } from './otel/otel';
import { getRedis } from './redis';
import { GLOBAL_SHARD_ID } from './sharding/sharding-utils';

const hostname = os.hostname();
const BASE_METRIC_OPTIONS = { attributes: { hostname } } satisfies RecordMetricOptions;
const METRIC_IN_SECS_OPTIONS = { ...BASE_METRIC_OPTIONS, options: { unit: 's' } } satisfies RecordMetricOptions;

let readerConn: PoolClient | undefined;
let writerConn: PoolClient | undefined;

export async function healthcheckHandler(_req: Request, res: Response): Promise<void> {
  // TODO{sharding} Should this test redis/postgres on every shard?

  writerConn ??= await getReservedDatabaseConnection(DatabaseMode.WRITER);
  let startTime = Date.now();
  const postgresWriterOk = await testPostgres(writerConn);
  const writerRoundtripMs = Date.now() - startTime;
  setGauge('medplum.db.healthcheckRTT', writerRoundtripMs / 1000, {
    ...METRIC_IN_SECS_OPTIONS,
    attributes: { ...METRIC_IN_SECS_OPTIONS.attributes, dbInstanceType: 'writer' },
  });

  if (hasSeparateReaderPool()) {
    readerConn ??= await getReservedDatabaseConnection(DatabaseMode.READER);
    startTime = Date.now();
    await testPostgres(readerConn);
    const readerRoundtripMs = Date.now() - startTime;
    setGauge('medplum.db.healthcheckRTT', readerRoundtripMs / 1000, {
      ...METRIC_IN_SECS_OPTIONS,
      attributes: { ...METRIC_IN_SECS_OPTIONS.attributes, dbInstanceType: 'reader' },
    });
  }

  startTime = Date.now();
  const redisOk = await testRedis(GLOBAL_SHARD_ID);
  const redisRoundtripMs = Date.now() - startTime;
  setGauge('medplum.redis.healthcheckRTT', redisRoundtripMs / 1000, METRIC_IN_SECS_OPTIONS);

  res.json({
    ok: true,
    version: MEDPLUM_VERSION,
    platform: process.platform,
    runtime: process.version,
    postgres: postgresWriterOk,
    redis: redisOk,
  });
}

async function getReservedDatabaseConnection(mode: DatabaseMode): Promise<PoolClient> {
  return getDatabasePool(mode, GLOBAL_SHARD_ID).connect();
}

export function cleanupReservedDatabaseConnections(): void {
  writerConn?.release(true);
  writerConn = undefined;
  readerConn?.release(true);
  readerConn = undefined;
}

function hasSeparateReaderPool(): boolean {
  return getDatabasePool(DatabaseMode.WRITER, 'global') !== getDatabasePool(DatabaseMode.READER, 'global');
}

async function testPostgres(pool: PoolClient): Promise<boolean> {
  return (await pool.query(`SELECT 1 AS "status"`)).rows[0].status === 1;
}

async function testRedis(shardId: string): Promise<boolean> {
  return (await getRedis(shardId).ping()) === 'PONG';
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MEDPLUM_VERSION } from '@medplum/core';
import type { Request, Response } from 'express';
import os from 'node:os';
import type { PoolClient } from 'pg';
import { DatabaseMode, getDatabasePool } from './database';
import { GLOBAL_SHARD_ID } from './fhir/sharding';
import type { RecordMetricOptions } from './otel/otel';
import { setGauge } from './otel/otel';
import type { RedisWithoutDuplicate } from './redis';
import { getAllRedisInstances } from './redis';

const hostname = os.hostname();
const BASE_METRIC_OPTIONS = { attributes: { hostname } } satisfies RecordMetricOptions;
const METRIC_IN_SECS_OPTIONS = { ...BASE_METRIC_OPTIONS, options: { unit: 's' } } satisfies RecordMetricOptions;

let readerConn: PoolClient | undefined;
let writerConn: PoolClient | undefined;

type ShardConns = { writer: PoolClient; reader: PoolClient | undefined };
const shardConns: Record<string, ShardConns> = {};

export async function healthcheckHandler(_req: Request, res: Response): Promise<void> {
  const globalShardResults = await checkShard(GLOBAL_SHARD_ID);

  const redisChecks = getAllRedisInstances();
  const redisResults = await Promise.all(
    redisChecks.map(async ({ label, instance }) => {
      const t0 = Date.now();
      const ok = await testRedis(instance);
      const roundtripMs = Date.now() - t0;
      setGauge('medplum.redis.healthcheckRTT', roundtripMs / 1000, {
        ...METRIC_IN_SECS_OPTIONS,
        attributes: { ...METRIC_IN_SECS_OPTIONS.attributes, redisInstanceType: label },
      });
      return { label, ok };
    })
  );

  const redisResult: Record<string, boolean> = {};
  for (const { label, ok } of redisResults) {
    redisResult[label] = ok;
  }

  // SHARDING only the global shard is shown in the healthcheck response, TBD if other shards should be included
  res.json({
    ok: true,
    version: MEDPLUM_VERSION,
    platform: process.platform,
    runtime: process.version,
    postgres: globalShardResults.writerOk,
    postgresReader: globalShardResults.readerOk,
    redis: redisResult.default,
    redisInstances: redisResult,
  });
}

export function cleanupReservedDatabaseConnections(): void {
  writerConn?.release(true);
  writerConn = undefined;
  readerConn?.release(true);
  readerConn = undefined;
}

type ShardCheckResult = {
  shardId: string;
  writerOk: boolean;
  readerOk?: boolean;
};

async function checkShard(shardId: string): Promise<ShardCheckResult> {
  let conns: ShardConns = shardConns[shardId];
  if (!conns) {
    const writerPool = await getDatabasePool(DatabaseMode.WRITER, shardId);
    const readerPool = await getDatabasePool(DatabaseMode.READER, shardId);
    shardConns[shardId] = conns = {
      writer: await writerPool.connect(),
      reader: readerPool !== writerPool ? await readerPool.connect() : undefined,
    };
  }

  let startTime = Date.now();
  const writerOk = await testPostgres(conns.writer);
  const writerRoundtripMs = Date.now() - startTime;
  setGauge('medplum.db.healthcheckRTT', writerRoundtripMs / 1000, {
    ...METRIC_IN_SECS_OPTIONS,
    attributes: { ...METRIC_IN_SECS_OPTIONS.attributes, dbInstanceType: 'writer', shardId },
  });

  let readerOk: boolean | undefined;
  if (conns.reader) {
    try {
      startTime = Date.now();
      readerOk = await testPostgres(conns.reader);
    } catch {
      readerOk = false;
    }
    const readerRoundtripMs = Date.now() - startTime;
    setGauge('medplum.db.healthcheckRTT', readerRoundtripMs / 1000, {
      ...METRIC_IN_SECS_OPTIONS,
      attributes: { ...METRIC_IN_SECS_OPTIONS.attributes, dbInstanceType: 'reader', shardId },
    });
  }
  return { shardId, writerOk, readerOk };
}

async function testPostgres(pool: PoolClient): Promise<boolean> {
  return (await pool.query(`SELECT 1 AS "status"`)).rows[0].status === 1;
}

async function testRedis(instance: RedisWithoutDuplicate): Promise<boolean> {
  return (await instance.ping()) === 'PONG';
}

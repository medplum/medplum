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

// Long-lived connections reserved for health checks, so a saturated pool does not fail the check.
// Stored as promises so concurrent checks share a single reservation.
const shardConns: Record<string, Map<DatabaseMode, Promise<PoolClient>>> = {};

export async function healthcheckHandler(_req: Request, res: Response): Promise<void> {
  const globalShardResults = await testShardDatabaseConnections(GLOBAL_SHARD_ID);

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

type TestShardResult = {
  shardId: string;
  writerOk: boolean;
  readerOk?: boolean;
};

async function testShardDatabaseConnections(shardId: string): Promise<TestShardResult> {
  let startTime = Date.now();
  const writerOk = await testReservedDatabaseConnection(shardId, DatabaseMode.WRITER);
  const writerRoundtripMs = Date.now() - startTime;
  setGauge('medplum.db.healthcheckRTT', writerRoundtripMs / 1000, {
    ...METRIC_IN_SECS_OPTIONS,
    attributes: { ...METRIC_IN_SECS_OPTIONS.attributes, dbInstanceType: 'writer', shardId },
  });

  let readerOk: boolean | undefined;
  if (hasSeparateReaderPool(shardId)) {
    try {
      startTime = Date.now();
      readerOk = await testReservedDatabaseConnection(shardId, DatabaseMode.READER);
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

async function testReservedDatabaseConnection(shardId: string, mode: DatabaseMode): Promise<boolean> {
  const conn = getReservedDatabaseConnection(shardId, mode);
  try {
    return await testPostgres(await conn);
  } catch {
    // The connection may have been dropped (network blip, proxy restart); retry once on a fresh one
    releaseReservedDatabaseConnection(shardId, mode, conn);
    return testPostgres(await getReservedDatabaseConnection(shardId, mode));
  }
}

function getReservedDatabaseConnection(shardId: string, mode: DatabaseMode): Promise<PoolClient> {
  let reservedConns = shardConns[shardId];
  if (!reservedConns) {
    shardConns[shardId] = reservedConns = new Map();
  }

  const existing = reservedConns.get(mode);
  if (existing) {
    return existing;
  }
  const conn = getDatabasePool(mode, shardId).connect();
  reservedConns.set(mode, conn);
  conn.then(
    // pg-pool removes its own error listener while a client is checked out
    (client) => client.on('error', () => releaseReservedDatabaseConnection(shardId, mode, conn)),
    () => releaseReservedDatabaseConnection(shardId, mode, conn)
  );
  return conn;
}

function releaseReservedDatabaseConnection(shardId: string, mode: DatabaseMode, conn: Promise<PoolClient>): void {
  const reservedConns = shardConns[shardId];
  if (reservedConns?.get(mode) !== conn) {
    return;
  }
  reservedConns.delete(mode);
  conn.then(
    (client) => client.release(true),
    () => undefined
  );
}

export function cleanupReservedDatabaseConnections(): void {
  for (const [shardId, conns] of Object.entries(shardConns)) {
    for (const [mode, conn] of conns) {
      releaseReservedDatabaseConnection(shardId, mode, conn);
    }
  }
}

function hasSeparateReaderPool(shardId: string): boolean {
  return getDatabasePool(DatabaseMode.WRITER, shardId) !== getDatabasePool(DatabaseMode.READER, shardId);
}

async function testPostgres(pool: PoolClient): Promise<boolean> {
  return (await pool.query(`SELECT 1 AS "status"`)).rows[0].status === 1;
}

async function testRedis(instance: RedisWithoutDuplicate): Promise<boolean> {
  return (await instance.ping()) === 'PONG';
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MEDPLUM_VERSION } from '@medplum/core';
import type { Request, Response } from 'express';
import os from 'node:os';
import type { PoolClient } from 'pg';
import { DatabaseMode, getDatabasePool } from './database';
import type { RecordMetricOptions } from './otel/otel';
import { setGauge } from './otel/otel';
import type { RedisWithoutDuplicate } from './redis';
import { getAllRedisInstances } from './redis';

const hostname = os.hostname();
const BASE_METRIC_OPTIONS = { attributes: { hostname } } satisfies RecordMetricOptions;
const METRIC_IN_SECS_OPTIONS = { ...BASE_METRIC_OPTIONS, options: { unit: 's' } } satisfies RecordMetricOptions;

// Long-lived connections reserved for health checks, so a saturated pool does not fail the check.
// Stored as promises so concurrent checks share a single reservation.
const reservedConns = new Map<DatabaseMode, Promise<PoolClient>>();

export async function healthcheckHandler(_req: Request, res: Response): Promise<void> {
  let startTime = Date.now();
  const postgresWriterOk = await testReservedDatabaseConnection(DatabaseMode.WRITER);
  const writerRoundtripMs = Date.now() - startTime;
  setGauge('medplum.db.healthcheckRTT', writerRoundtripMs / 1000, {
    ...METRIC_IN_SECS_OPTIONS,
    attributes: { ...METRIC_IN_SECS_OPTIONS.attributes, dbInstanceType: 'writer' },
  });

  let postgresReaderOk: boolean | undefined;
  if (hasSeparateReaderPool()) {
    try {
      startTime = Date.now();
      postgresReaderOk = await testReservedDatabaseConnection(DatabaseMode.READER);
    } catch {
      postgresReaderOk = false;
    }
    const readerRoundtripMs = Date.now() - startTime;
    setGauge('medplum.db.healthcheckRTT', readerRoundtripMs / 1000, {
      ...METRIC_IN_SECS_OPTIONS,
      attributes: { ...METRIC_IN_SECS_OPTIONS.attributes, dbInstanceType: 'reader' },
    });
  }

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

  res.json({
    ok: true,
    version: MEDPLUM_VERSION,
    platform: process.platform,
    runtime: process.version,
    postgres: postgresWriterOk,
    postgresReader: postgresReaderOk,
    redis: redisResult.default,
    redisInstances: redisResult,
  });
}

async function testReservedDatabaseConnection(mode: DatabaseMode): Promise<boolean> {
  const conn = getReservedDatabaseConnection(mode);
  try {
    return await testPostgres(await conn);
  } catch {
    // The connection may have been dropped (network blip, proxy restart); retry once on a fresh one
    releaseReservedDatabaseConnection(mode, conn);
    return testPostgres(await getReservedDatabaseConnection(mode));
  }
}

function getReservedDatabaseConnection(mode: DatabaseMode): Promise<PoolClient> {
  const existing = reservedConns.get(mode);
  if (existing) {
    return existing;
  }
  const conn = getDatabasePool(mode).connect();
  reservedConns.set(mode, conn);
  conn.then(
    // pg-pool removes its own error listener while a client is checked out
    (client) => client.on('error', () => releaseReservedDatabaseConnection(mode, conn)),
    () => releaseReservedDatabaseConnection(mode, conn)
  );
  return conn;
}

function releaseReservedDatabaseConnection(mode: DatabaseMode, conn: Promise<PoolClient>): void {
  if (reservedConns.get(mode) !== conn) {
    return;
  }
  reservedConns.delete(mode);
  conn.then(
    (client) => client.release(true),
    () => undefined
  );
}

export function cleanupReservedDatabaseConnections(): void {
  for (const [mode, conn] of reservedConns) {
    releaseReservedDatabaseConnection(mode, conn);
  }
}

function hasSeparateReaderPool(): boolean {
  return getDatabasePool(DatabaseMode.WRITER) !== getDatabasePool(DatabaseMode.READER);
}

async function testPostgres(pool: PoolClient): Promise<boolean> {
  return (await pool.query(`SELECT 1 AS "status"`)).rows[0].status === 1;
}

async function testRedis(instance: RedisWithoutDuplicate): Promise<boolean> {
  return (await instance.ping()) === 'PONG';
}

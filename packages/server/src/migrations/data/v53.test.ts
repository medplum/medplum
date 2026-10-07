// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { BodyStructure, Observation, Patient } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { DelayedError } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { vi } from 'vitest';
import { initAppServices, shutdownApp } from '../../app';
import { getConfig, loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { TODO_SHARD_ID } from '../../fhir/sharding';
import { createTestProject, withQueryInterceptor, withTestContext } from '../../test.setup';
import { queueRegistry } from '../../workers/utils';
import type { MigrationActionResult } from '../types';
import type { CustomPostDeployMigrationJobData } from './types';
import type { BackfillOverrides, ProjectIdBackfillJobData } from './v53';
import { AdaptiveConcurrency, computeRanges, callback as migrationFn, uuidPartition } from './v53';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('v52 key ranges', () => {
  // Ranges are what let workers run without coordinating: an overlap hands two of them the same
  // rows in opposite orders, and a gap silently leaves rows NULL. Neither shows up as a failure
  // anywhere else, so the tiling is checked directly.
  test.each([0, -1, 1, 25_000])('gives %i estimated rows a single fully open range', (rowEstimate) => {
    expect(computeRanges(rowEstimate)).toEqual([{ lower: undefined, upper: undefined }]);
  });

  test('tiles the uuid space with no gaps and no overlaps', () => {
    const ranges = computeRanges(1_000_000, 25_000);
    expect(ranges).toHaveLength(40);

    // 2^128 is not a representable uuid, and ffffffff-...-ffffffff is a legal resourceId that a
    // `<` bound would exclude, so the outermost bounds are open rather than clamped
    expect(ranges[0].lower).toBeUndefined();
    expect(ranges[ranges.length - 1].upper).toBeUndefined();

    for (let i = 0; i < ranges.length - 1; i++) {
      expect(ranges[i].upper).toMatch(UUID_PATTERN);
      expect(ranges[i].upper).toBe(ranges[i + 1].lower);
      expect((ranges[i + 1].lower as string) > (ranges[i].lower ?? '')).toBe(true);
    }
  });

  test('caps the number of ranges so a bad estimate cannot explode the statement count', () => {
    expect(computeRanges(Number.MAX_SAFE_INTEGER, 1)).toHaveLength(65_536);
  });

  test('spreads boundaries evenly across the key space', () => {
    expect(uuidPartition(1, 2)).toBe('80000000-0000-0000-0000-000000000000');
    expect(uuidPartition(1, 4)).toBe('40000000-0000-0000-0000-000000000000');
    expect(uuidPartition(3, 4)).toBe('c0000000-0000-0000-0000-000000000000');
    expect(() => uuidPartition(0, 4)).toThrow(/uuid boundary/);
    expect(() => uuidPartition(4, 4)).toThrow(/uuid boundary/);
  });
});

describe('v52 adaptive concurrency', () => {
  const TARGET_MS = 100;
  const BACKOFF_MS = 300;

  function clock(limiter: AdaptiveConcurrency): (durationMs: number) => void {
    let now = 0;
    return (durationMs) => {
      const start = now;
      now += durationMs;
      limiter.record(start, now);
    };
  }

  test('starts at one and grows by one per round of fast ranges, up to the ceiling', () => {
    const limiter = new AdaptiveConcurrency(3, TARGET_MS, BACKOFF_MS);
    const range = clock(limiter);
    expect(limiter.limit).toBe(1);
    expect(limiter.admits(0)).toBe(true);
    expect(limiter.admits(1)).toBe(false);

    range(10);
    expect(limiter.limit).toBe(2);
    // A round at two workers is two ranges
    range(10);
    expect(limiter.limit).toBe(2);
    range(10);
    expect(limiter.limit).toBe(3);
    expect(limiter.admits(2)).toBe(true);

    for (let i = 0; i < 10; i++) {
      range(10);
    }
    expect(limiter.limit).toBe(3);
  });

  test('halves on a slow range and never drops below one', () => {
    const limiter = new AdaptiveConcurrency(6, TARGET_MS, BACKOFF_MS);
    const range = clock(limiter);
    while (limiter.limit < 6) {
      range(10);
    }

    range(BACKOFF_MS);
    expect(limiter.limit).toBe(3);
    range(BACKOFF_MS);
    expect(limiter.limit).toBe(1);
    range(BACKOFF_MS);
    expect(limiter.limit).toBe(1);
    expect(limiter.admits(0)).toBe(true);
  });

  test('ignores ranges that started before the last adjustment', () => {
    const limiter = new AdaptiveConcurrency(4, TARGET_MS, BACKOFF_MS);
    const range = clock(limiter);
    while (limiter.limit < 4) {
      range(10);
    }

    // Four ranges in flight together, all slowed by the same pressure. Only the first to finish
    // reflects the concurrency that caused it; the rest would cascade the limit down to one.
    const start = 1_000_000;
    for (let i = 0; i < 4; i++) {
      limiter.record(start, start + BACKOFF_MS + i);
    }
    expect(limiter.limit).toBe(2);
  });

  test('signals every change of the limit, and only a change, until the listener unsubscribes', () => {
    const limiter = new AdaptiveConcurrency(4, TARGET_MS, BACKOFF_MS);
    const range = clock(limiter);
    const listener = vi.fn();
    const unsubscribe = limiter.onLimitChange(listener);

    range(TARGET_MS + 1);
    expect(limiter.limit).toBe(1);
    expect(listener).not.toHaveBeenCalled();
    range(10);
    expect(limiter.limit).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
    range(BACKOFF_MS);
    expect(limiter.limit).toBe(1);
    expect(listener).toHaveBeenCalledTimes(2);

    // One limiter outlives every table's run, so a listener left behind by each would accumulate
    // for the whole migration
    unsubscribe();
    range(10);
    expect(limiter.limit).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('holds, and restarts the healthy streak, between the target and the backoff threshold', () => {
    const limiter = new AdaptiveConcurrency(3, TARGET_MS, BACKOFF_MS);
    const range = clock(limiter);
    range(10);
    expect(limiter.limit).toBe(2);

    range(10);
    range(TARGET_MS + 1);
    range(10);
    expect(limiter.limit).toBe(2);
    range(10);
    expect(limiter.limit).toBe(3);
  });
});

describe('v52', () => {
  let client: PoolClient;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
    client = await getDatabasePool(DatabaseMode.WRITER).connect();
  });

  afterAll(async () => {
    client.release();
    await shutdownApp();
  });

  const cleanupIds: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    if (cleanupIds.length > 0) {
      await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = ANY($1::uuid[])`, [
        cleanupIds.splice(0),
      ]);
    }
  });

  const jobData: CustomPostDeployMigrationJobData = {
    type: 'custom',
    target: { kind: 'shard', shardId: TODO_SHARD_ID },
    tracking: { owner: 'system', asyncJobId: randomUUID() },
  };

  const SINGLE_RANGE: BackfillOverrides = { rangeTargetRows: Number.MAX_SAFE_INTEGER };
  const BEGIN = expect.stringMatching(/^BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL statement_timeout TO '[^']+'$/);
  const BEGIN_WITHOUT_SEQSCAN = expect.stringMatching(
    /^BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL statement_timeout TO '[^']+'; SET LOCAL enable_seqscan = off$/
  );

  type RunOptions = BackfillOverrides & {
    job?: Job<CustomPostDeployMigrationJobData>;
    data?: CustomPostDeployMigrationJobData;
    results?: MigrationActionResult[];
  };

  async function run(options: RunOptions = {}): Promise<MigrationActionResult[]> {
    const { job, data = jobData, results = [], ...overrides } = options;
    await migrationFn(client, results, job, data, { concurrency: 1, clients: [client], ...overrides });
    return results;
  }

  function mockJob(data: CustomPostDeployMigrationJobData = jobData): Job<CustomPostDeployMigrationJobData> {
    return {
      id: '1',
      queueName: 'TestQueue',
      token: 'token',
      data,
      updateData: vi.fn(),
      moveToDelayed: vi.fn(),
    } as unknown as Job<CustomPostDeployMigrationJobData>;
  }

  type QueryFn = (...args: any[]) => Promise<any>;
  type QueryHook = (sql: string, args: any[], original: QueryFn) => unknown;
  function spyQuery(onQuery?: QueryHook): { statements: string[]; calls: { sql: string; params: unknown[] }[] } {
    const original = client.query.bind(client) as QueryFn;
    const statements: string[] = [];
    const calls: { sql: string; params: unknown[] }[] = [];
    vi.spyOn(client, 'query').mockImplementation((async (...args: any[]) => {
      const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
      if (typeof sql === 'string') {
        statements.push(sql);
        calls.push({ sql, params: args[1] ?? [] });
        const override = await onQuery?.(sql, args, original);
        if (override !== undefined) {
          return override;
        }
      }
      return original(...args);
    }) as typeof client.query);
    return { statements, calls };
  }

  function onFirstBackfill(fn: (original: QueryFn) => unknown): QueryHook {
    let fired = false;
    return (sql, _args, original) => {
      if (!fired && sql.includes('UPDATE "Observation_References"')) {
        fired = true;
        return fn(original);
      }
      return undefined;
    };
  }

  async function createNulledObservations(count: number): Promise<{ ids: string[]; projectId: string }> {
    const { repo, project } = await createTestProject({ withRepo: true });
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const obs = await repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: '3141-9' }] },
        subject: createReference(patient),
      });
      ids.push(obs.id);
    }
    // Writes populate projectId, so simulate rows written before this migration's release
    await client.query(`UPDATE "Observation_References" SET "projectId" = NULL WHERE "resourceId" = ANY($1::uuid[])`, [
      ids,
    ]);
    cleanupIds.push(...ids);
    return { ids, projectId: project.id };
  }

  async function insertOrphan(resourceId = randomUUID()): Promise<string> {
    await client.query(
      `INSERT INTO "Observation_References" ("resourceId", "targetId", "code") VALUES ($1, $2, 'subject')`,
      [resourceId, randomUUID()]
    );
    cleanupIds.push(resourceId);
    return resourceId;
  }

  async function expectBackfilled(ids: string[], projectId: string): Promise<void> {
    const rows = await client.query<{ projectId: string | null }>(
      `SELECT "projectId" FROM "Observation_References" WHERE "resourceId" = ANY($1::uuid[])`,
      [ids]
    );
    expect(rows.rows).toHaveLength(ids.length * 2); // patient and subject per observation
    expect(rows.rows.every((r) => r.projectId === projectId)).toBe(true);
  }

  async function withWorkers<T>(count: number, fn: (workers: PoolClient[]) => Promise<T>): Promise<T> {
    const pool = getDatabasePool(DatabaseMode.WRITER);
    const workers: PoolClient[] = [];
    try {
      for (let i = 0; i < count; i++) {
        workers.push(await pool.connect());
      }
      return await fn(workers);
    } finally {
      for (const worker of workers) {
        worker.release(true);
      }
    }
  }

  test('backfills projectId, deletes orphans, and is a no-op on a second run', () =>
    withTestContext(async () => {
      const { ids, projectId } = await createNulledObservations(1);
      // A reference row whose referencing resource does not exist
      const orphanId = await insertOrphan();

      const results = await run();

      await expectBackfilled(ids, projectId);
      const orphans = await client.query(`SELECT 1 FROM "Observation_References" WHERE "resourceId" = $1`, [orphanId]);
      expect(orphans.rowCount).toBe(0);
      expect(results.find((r) => r.name === 'Backfill "Observation_References"."projectId"')).toMatchObject({
        updated: 2,
        orphansDeleted: 1,
        remaining: 0,
      });

      // Running again finds no remaining work, which is what makes an interrupted run resumable
      expect((await run()).find((r) => r.name === 'Backfill "Observation_References"."projectId"')).toBeUndefined();
    }));

  test('finishes the table when a resource is purged while the backfill is in flight', () =>
    withTestContext(async () => {
      const {
        ids: [obsId],
      } = await createNulledObservations(1);

      // A hard delete landing while the backfill is in flight leaves rows that can never be
      // updated, which must not be mistaken for "no work remains". The orphan sweep runs after the
      // backfill, so it still sees them.
      spyQuery(
        onFirstBackfill(async () => {
          await getDatabasePool(DatabaseMode.WRITER).query(`DELETE FROM "Observation" WHERE id = $1`, [obsId]);
        })
      );

      const results = await run();

      expect(results.find((r) => r.name === 'Backfill "Observation_References"."projectId"')).toMatchObject({
        remaining: 0,
      });
      const rows = await client.query(`SELECT 1 FROM "Observation_References" WHERE "resourceId" = $1`, [obsId]);
      expect(rows.rowCount).toBe(0);
    }));

  test('leaves rows NULL when the referencing resource has no project', () =>
    withTestContext(async () => {
      const { repo, project } = await createTestProject({ withRepo: true });
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
      const bodyStructure = await repo.createResource<BodyStructure>({
        resourceType: 'BodyStructure',
        patient: createReference(patient),
      });

      await client.query(`ALTER TABLE "BodyStructure" ALTER COLUMN "projectId" DROP NOT NULL`);
      try {
        await client.query(`UPDATE "BodyStructure" SET "projectId" = NULL WHERE id = $1`, [bodyStructure.id]);
        await client.query(`UPDATE "BodyStructure_References" SET "projectId" = NULL WHERE "resourceId" = $1`, [
          bodyStructure.id,
        ]);

        const results = await run();

        expect(results.find((r) => r.name === 'Backfill "BodyStructure_References"."projectId"')).toMatchObject({
          updated: 0,
          orphansDeleted: 0,
          remaining: 1,
          rowsWithoutProject: 1,
        });
        const rows = await client.query<{ projectId: string | null }>(
          `SELECT "projectId" FROM "BodyStructure_References" WHERE "resourceId" = $1`,
          [bodyStructure.id]
        );
        expect(rows.rows).toEqual([{ projectId: null }]);
      } finally {
        await client.query(`DELETE FROM "BodyStructure_References" WHERE "resourceId" = $1`, [bodyStructure.id]);
        await client.query(`UPDATE "BodyStructure" SET "projectId" = $2 WHERE id = $1`, [bodyStructure.id, project.id]);
        await client.query(`ALTER TABLE "BodyStructure" ALTER COLUMN "projectId" SET NOT NULL`);
      }
    }));

  test('fails the job when rows that could have been backfilled remain', () =>
    withTestContext(async () => {
      await createNulledObservations(1);
      spyQuery((sql) => (sql.includes('UPDATE "Observation_References"') ? { rowCount: 0, rows: [] } : undefined));
      await expect(run()).rejects.toThrow(/did not converge.*Observation_References/);
    }));

  describe('range statements', () => {
    test('analyzes every table first, then runs one whole-table statement per table without disabling seq scans', () =>
      withTestContext(async () => {
        await createNulledObservations(1);

        const { statements } = spyQuery();
        const results = await run(SINGLE_RANGE);

        // The planner's estimate for `"projectId" IS NULL` is what keeps both this migration and
        // chained search off a full table scan, and a freshly added column has no statistics at all
        const analyze = results[0];
        expect(analyze.name).toBe('Analyze reference table "projectId" columns');
        expect((analyze.analyzed as number) + (analyze.skipped as number)).toBeGreaterThan(1);

        // Every table is covered before the first one is touched, not just the table in hand
        const firstAnalyze = statements.findIndex((sql) => sql.startsWith('ANALYZE'));
        const firstBackfill = statements.findIndex((sql) => sql.includes('UPDATE "Observation_References"'));
        expect(firstAnalyze).toBeGreaterThanOrEqual(0);
        expect(firstAnalyze).toBeLessThan(firstBackfill);

        // An unbounded statement matches every row, which is what a sequential scan is for
        expect(results.find((r) => r.name === 'Backfill "Observation_References"."projectId"')?.ranges).toBe(1);
        const rangeIndexes = statements.flatMap((sql, i) =>
          sql.includes('UPDATE "Observation_References"') || sql.includes('DELETE FROM "Observation_References" r')
            ? [i]
            : []
        );
        expect(rangeIndexes).toHaveLength(2);
        for (const i of rangeIndexes) {
          expect(statements[i - 1]).toEqual(BEGIN);
          expect(statements[i + 1]).toBe('COMMIT');
        }
        expect(statements.filter((sql) => sql.includes('enable_seqscan'))).toEqual([]);
      }));

    test('sweeps each keyed range right behind its backfill, with seq scans disabled in its own transaction', () =>
      withTestContext(async () => {
        const {
          ids: [obsId],
        } = await createNulledObservations(1);
        const orphanId = await insertOrphan();

        const { calls } = spyQuery();
        // One row per range forces the keyed-range path rather than a single whole-table statement
        const results = await run({ rangeTargetRows: 1 });
        const statements = calls.map((c) => c.sql);

        expect(results.find((r) => r.name === 'Backfill "Observation_References"."projectId"')?.ranges).toBeGreaterThan(
          1
        );

        const rangeIndexes = statements.flatMap((sql, i) =>
          sql.includes('UPDATE "Observation_References"') || sql.includes('DELETE FROM "Observation_References" r')
            ? [i]
            : []
        );
        expect(rangeIndexes.length).toBeGreaterThan(2);
        for (const i of rangeIndexes) {
          expect(statements[i - 1]).toEqual(BEGIN_WITHOUT_SEQSCAN);
          expect(statements[i + 1]).toBe('COMMIT');
        }
        expect(statements.filter((sql) => /^SET (enable_seqscan|statement_timeout)/.test(sql))).toEqual([]);

        // Sweeping while the range's pages are still cached, rather than in a second pass over the
        // whole table, is what keeps the sweep from costing a second full read. Backfilling first
        // leaves only orphans NULL in the range.
        for (let k = 0; k < rangeIndexes.length; k += 2) {
          expect(statements[rangeIndexes[k]]).toContain('UPDATE "Observation_References"');
          expect(statements[rangeIndexes[k + 1]]).toContain('DELETE FROM "Observation_References" r');
          expect(calls[rangeIndexes[k + 1]].params).toEqual(calls[rangeIndexes[k]].params);
        }

        const remaining = await client.query(
          `SELECT 1 FROM "Observation_References" WHERE "resourceId" = ANY($1::uuid[]) AND "projectId" IS NULL`,
          [[obsId, orphanId]]
        );
        expect(remaining.rowCount).toBe(0);
      }));

    test('abandons a range that hits the statement timeout', () =>
      withTestContext(async () => {
        await createNulledObservations(1);

        let timedOut = 0;
        spyQuery(async (sql, _args, original) => {
          if (sql.includes('UPDATE "Observation_References"')) {
            timedOut++;
            await original(`SET LOCAL statement_timeout TO '10ms'`);
            return original('SELECT pg_sleep(1)');
          }
          return undefined;
        });

        const results: MigrationActionResult[] = [];
        await expect(run({ ...SINGLE_RANGE, results })).rejects.toThrow(/did not converge.*Observation_References/);

        expect(timedOut).toBe(2);
        expect(results.find((r) => r.name === 'Backfill "Observation_References"."projectId"')).toMatchObject({
          abandonedRanges: 1,
          passes: 1,
        });
      }));

    test.each([
      {
        failure: 'a statement timeout',
        inject: async (original: QueryFn) => {
          await original(`SET LOCAL statement_timeout TO '10ms'`);
          return original('SELECT pg_sleep(1)');
        },
        retryBegin: BEGIN_WITHOUT_SEQSCAN,
      },
      {
        failure: 'a deadlock',
        inject: async () => {
          throw Object.assign(new Error('deadlock detected'), { code: '40P01' });
        },
        retryBegin: BEGIN,
      },
    ])('rolls back and retries a whole-table range after $failure', ({ inject, retryBegin }) =>
      withTestContext(async () => {
        await createNulledObservations(1);

        const { statements } = spyQuery(onFirstBackfill(inject));
        const results = await run(SINGLE_RANGE);

        expect(results.find((r) => r.name === 'Backfill "Observation_References"."projectId"')).toMatchObject({
          remaining: 0,
        });
        expect(
          results.find((r) => r.name === 'Backfill "Observation_References"."projectId"')?.abandonedRanges
        ).toBeUndefined();
        // The failed attempt's transaction is rolled back, and the retry runs in a fresh one
        const updates = statements.flatMap((sql, i) => (sql.includes('UPDATE "Observation_References"') ? [i] : []));
        expect(updates.length).toBeGreaterThanOrEqual(2);
        expect(statements.slice(updates[0] + 1, updates[1])).toEqual(['ROLLBACK', retryBegin]);
      })
    );

    test('retries the sweep with sequential scans off after a timeout in the backfill', () =>
      withTestContext(async () => {
        await createNulledObservations(1);

        const { statements } = spyQuery(
          onFirstBackfill(async (original) => {
            await original(`SET LOCAL statement_timeout TO '10ms'`);
            return original('SELECT pg_sleep(1)');
          })
        );
        await run(SINGLE_RANGE);

        const updates = statements.flatMap((sql, i) => (sql.includes('UPDATE "Observation_References"') ? [i] : []));
        const sweep = statements.findIndex(
          (sql, i) =>
            i > updates[1] &&
            (sql.includes('UPDATE "Observation_References"') || sql.includes('DELETE FROM "Observation_References" r'))
        );
        expect(statements[sweep - 1]).toEqual(BEGIN_WITHOUT_SEQSCAN);
      }));

    test('rolls back a range transaction whose setup fails after it began', () =>
      withTestContext(async () => {
        await createNulledObservations(1);

        let failed = false;
        const { statements } = spyQuery((sql, _args, original) => {
          if (!failed && sql.startsWith('BEGIN ISOLATION LEVEL READ COMMITTED')) {
            failed = true;
            // A real failure inside the preamble: BEGIN takes effect, then the bad setting aborts the
            // transaction, leaving the connection unusable until something rolls it back
            return original(`BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL statement_timeout TO 'bogus'`);
          }
          return undefined;
        });

        await expect(run(SINGLE_RANGE)).rejects.toThrow(/statement_timeout/);
        const begin = statements.findIndex((sql) => sql.startsWith('BEGIN ISOLATION LEVEL READ COMMITTED'));
        expect(statements[begin + 1]).toBe('ROLLBACK');
      }));
  });

  describe('parallel workers', () => {
    function runOnWorkers(
      overrides: BackfillOverrides
    ): Promise<{ results: MigrationActionResult[]; rangesPerWorker: number[] }> {
      return withWorkers(3, async (workers) => {
        const rangesPerWorker = workers.map(() => 0);
        workers.forEach((worker, i) => {
          const original = worker.query.bind(worker) as QueryFn;
          vi.spyOn(worker, 'query').mockImplementation((async (...args: any[]) => {
            const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
            if (typeof sql === 'string' && sql.includes('UPDATE "Observation_References"')) {
              rangesPerWorker[i]++;
            }
            return original(...args);
          }) as typeof worker.query);
        });
        const results = await run({ concurrency: workers.length, clients: workers, ...overrides });
        return { results, rangesPerWorker };
      });
    }

    test.each([
      {
        name: 'backfills every row when key ranges run in parallel',
        count: 20,
        overrides: { rangeTargetRows: 1, rangeTargetMs: Number.MAX_SAFE_INTEGER },
        concurrency: 3,
        expectWorkers: (counts: number[]) => expect(counts.every((count) => count > 0)).toBe(true),
      },
      {
        name: 'stays on one worker while every range is slower than its target',
        count: 5,
        overrides: { rangeTargetRows: 1, rangeTargetMs: 0 },
        concurrency: 1,
        expectWorkers: (counts: number[]) => {
          expect(counts[0]).toBeGreaterThan(0);
          expect(counts.slice(1)).toEqual([0, 0]);
        },
      },
    ])('$name', ({ count, overrides, concurrency, expectWorkers }) =>
      withTestContext(async () => {
        const { ids, projectId } = await createNulledObservations(count);

        const { results, rangesPerWorker } = await runOnWorkers(overrides);

        // A gap between ranges would leave rows NULL, which is self-detecting: the table then fails
        // to converge and `run` throws before reaching this point
        const result = results.find((r) => r.name === 'Backfill "Observation_References"."projectId"');
        expect(result?.ranges).toBeGreaterThan(1);
        expect(result?.concurrency).toBe(concurrency);
        expectWorkers(rangesPerWorker);
        await expectBackfilled(ids, projectId);
      })
    );

    test('returns every worker connection it checked out', () =>
      withTestContext(async () => {
        await createNulledObservations(1);
        const pool = getDatabasePool(DatabaseMode.WRITER);
        const before = pool.totalCount;

        // No `clients` override, so the migration acquires and releases its own connections.
        // `connectionTimeoutMillis` is unset, so a leak would stall request handlers silently.
        await migrationFn(client, [], undefined, jobData, { concurrency: 2, ...SINGLE_RANGE });

        expect(pool.waitingCount).toBe(0);
        expect(pool.totalCount).toBeLessThanOrEqual(before);
      }));
  });

  describe('shutdown and failures', () => {
    test.each([
      { name: 'one worker', workers: 1, overrides: {} },
      { name: 'several workers in flight', workers: 3, overrides: { rangeTargetRows: 1 } },
      // Every range is slow, so the limit never grows to wake workers 1 and 2: only worker 0
      // leaving the loop can, and the job has to settle rather than hang
      { name: 'held-back workers', workers: 3, overrides: { rangeTargetRows: 1, rangeTargetMs: 0 } },
    ])('delays the job exactly once when the queue closes with $name', ({ workers: count, overrides }) =>
      withTestContext(async () => {
        await createNulledObservations(1);

        let closing = false;
        vi.spyOn(queueRegistry, 'isClosing').mockImplementation(() => closing);
        const job = mockJob();

        await withWorkers(count, async (workers) => {
          await withQueryInterceptor(
            (sql) => {
              if (sql?.includes('UPDATE "Observation_References"')) {
                closing = true;
              }
              return undefined;
            },
            async () => {
              await expect(run({ job, concurrency: count, clients: workers, ...overrides })).rejects.toThrow(
                DelayedError
              );
            }
          );
        });

        expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
        expect(vi.mocked(job.updateData).mock.calls.at(-1)?.[0]).toMatchObject({
          resumeFromResourceType: 'Observation',
        });
      })
    );

    test.each([
      {
        name: 'delays the job when the database connection is lost',
        code: '57P01',
        transientFailures: 0,
        delays: true,
      },
      {
        name: 'fails the job once lost connections have exhausted their restarts',
        code: '57P01',
        transientFailures: 5,
      },
      { name: 'fails the job outright on errors other than a lost connection', code: '42P01', transientFailures: 0 },
    ])('$name', ({ code, transientFailures, delays }) =>
      withTestContext(async () => {
        await createNulledObservations(1);
        const data: ProjectIdBackfillJobData = { ...jobData, ...(transientFailures ? { transientFailures } : {}) };
        const job = mockJob(data);

        spyQuery((sql) => {
          if (sql.includes('UPDATE "Observation_References"')) {
            throw Object.assign(new Error('terminating connection due to administrator command'), { code });
          }
          return undefined;
        });

        if (delays) {
          await expect(run({ job, data })).rejects.toThrow(DelayedError);
          expect(vi.mocked(job.updateData).mock.calls.at(-1)?.[0]).toMatchObject({
            resumeFromResourceType: 'Observation',
            transientFailures: 1,
          });
          expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
        } else {
          await expect(run({ job, data })).rejects.toThrow(/administrator command/);
          expect(job.moveToDelayed).not.toHaveBeenCalled();
        }
      })
    );

    test('delays the job when the connection drops before a failed range can roll back', () =>
      withTestContext(async () => {
        await createNulledObservations(1);
        const job = mockJob();

        let deadlocked = false;
        let rollbackFailed = false;
        spyQuery(async (sql, _args, original) => {
          if (!deadlocked && sql.includes('UPDATE "Observation_References"')) {
            deadlocked = true;
            throw Object.assign(new Error('deadlock detected'), { code: '40P01' });
          }
          if (deadlocked && !rollbackFailed && sql === 'ROLLBACK') {
            rollbackFailed = true;
            // Really end the transaction so the shared test connection stays usable
            await original('ROLLBACK');
            throw new Error('Connection terminated unexpectedly');
          }
          return undefined;
        });

        // The deadlock is what the statement failed with, but the lost connection is what matters
        await expect(run({ job })).rejects.toThrow(DelayedError);
        expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
      }));
  });

  describe('progress and resume', () => {
    test('saves progress as it goes, not only when the queue closes', () =>
      withTestContext(async () => {
        await createNulledObservations(1);
        const job = mockJob();

        // A process killed outright never reaches the closing path; BullMQ re-runs the stalled job
        // with whatever data was last saved
        await run({ job, rangeTargetRows: 1, progressIntervalMs: 0 });

        const saved = vi.mocked(job.updateData).mock.calls.map(([data]) => data as ProjectIdBackfillJobData);
        expect(saved).toContainEqual(
          expect.objectContaining({
            resumeFromResourceType: 'Observation',
            resumeStep: 'backfill',
            resumeFromResourceId: expect.stringMatching(UUID_PATTERN),
          })
        );
        expect(saved).toContainEqual(
          expect.objectContaining({
            resumeFromResourceType: undefined,
            completedResourceTypes: expect.arrayContaining(['Observation']),
          })
        );
        expect(vi.mocked(job.updateData).mock.calls.at(-1)?.[0]).toMatchObject({
          resumeFromResourceType: undefined,
          completedResourceTypes: expect.arrayContaining(['Observation']),
          rewrittenResourceTypes: expect.arrayContaining(['Observation']),
        });
        expect(job.moveToDelayed).not.toHaveBeenCalled();
      }));

    test('names the table in its saved progress before rewriting any of it', () =>
      withTestContext(async () => {
        await createNulledObservations(1);
        const job = mockJob();

        let savedBeforeRewrite: ProjectIdBackfillJobData | undefined;
        spyQuery(
          onFirstBackfill(() => {
            savedBeforeRewrite = vi.mocked(job.updateData).mock.calls.at(-1)?.[0];
          })
        );

        await run({ job, ...SINGLE_RANGE, progressIntervalMs: Number.MAX_SAFE_INTEGER });

        expect(savedBeforeRewrite).toMatchObject({ resumeFromResourceType: 'Observation' });
      }));

    test('skips ranges below the resume point when resuming a table mid-backfill', () =>
      withTestContext(async () => {
        // Work for the resumed attempt, placed above the resume point: everything below it is done
        await insertOrphan('f0000000-0000-4000-8000-000000000001');
        const data: ProjectIdBackfillJobData = {
          ...jobData,
          resumeFromResourceType: 'Observation',
          resumeFromResourceId: '40000000-0000-0000-0000-000000000000',
          resumeStep: 'backfill',
        };

        const { statements } = spyQuery();
        const results = await run({ rangeTargetRows: 1, data });

        expect(results.find((r) => r.name === 'Backfill "Observation_References"."projectId"')).toMatchObject({
          passes: 1,
          orphansDeleted: 1,
        });
        const ranges = results.find((r) => r.name === 'Backfill "Observation_References"."projectId"')
          ?.ranges as number;
        const updates = statements.filter((sql) => sql.includes('UPDATE "Observation_References"')).length;
        expect(updates).toBeLessThan(ranges);
        expect(updates).toBeGreaterThanOrEqual(Math.floor((ranges * 3) / 4));
      }));

    test('goes straight to verification when a previous attempt finished every range', () =>
      withTestContext(async () => {
        await insertOrphan();
        const data: ProjectIdBackfillJobData = {
          ...jobData,
          resumeFromResourceType: 'Observation',
          resumeStep: 'verify',
        };

        const { statements } = spyQuery();
        const results = await run({ ...SINGLE_RANGE, data });

        // Verification finds the orphan left behind, so a second, full pass still runs
        const firstCount = statements.findIndex((sql) => sql.includes('AS remaining'));
        const firstUpdate = statements.findIndex((sql) => sql.includes('UPDATE "Observation_References"'));
        expect(firstCount).toBeGreaterThanOrEqual(0);
        expect(firstUpdate).toBeGreaterThan(firstCount);
        expect(results.find((r) => r.name === 'Backfill "Observation_References"."projectId"')).toMatchObject({
          passes: 2,
          orphansDeleted: 1,
          remaining: 0,
        });
      }));

    test.each([
      {
        name: 'a table an earlier attempt proved complete and rewrote',
        resume: { completedResourceTypes: ['Observation'], rewrittenResourceTypes: ['Observation'] },
        completed: true,
      },
      {
        // Even if it left no work
        name: 'the table an earlier attempt was partway through',
        resume: { resumeFromResourceType: 'Observation', resumeStep: 'verify' },
        completed: false,
      },
    ])('vacuums $name before building its index', ({ resume, completed }) =>
      withTestContext(async () => {
        if (completed) {
          await createNulledObservations(1);
        }
        await client.query(`DROP INDEX IF EXISTS "Observation_Refs_projectId_code_targetId_idx"`);

        const { statements } = spyQuery();
        await run({ ...SINGLE_RANGE, data: { ...jobData, ...resume } });

        // Skipping the table this attempt does not undo the bloat the previous one left behind
        expect(statements).toContain('VACUUM (ANALYZE) "Observation_References"');
        if (completed) {
          // Without the `projectId` index in place, re-proving a finished table costs a full scan of it
          expect(statements.some((sql) => sql.includes('UPDATE "Observation_References"'))).toBe(false);
        }
      })
    );

    test('does not vacuum again a rewritten table whose index an earlier attempt already built', () =>
      withTestContext(async () => {
        const data: ProjectIdBackfillJobData = {
          ...jobData,
          completedResourceTypes: ['Observation'],
          rewrittenResourceTypes: ['Observation'],
        };
        // Built by the earlier attempt, right after it vacuumed the table
        await run(SINGLE_RANGE);

        const { statements } = spyQuery();
        await run({ ...SINGLE_RANGE, data });
        expect(statements).not.toContain('VACUUM (ANALYZE) "Observation_References"');
      }));
  });

  test('skips the backfill but still builds the index on tables with chained search disabled', () =>
    withTestContext(async () => {
      const {
        ids: [obsId],
      } = await createNulledObservations(1);
      const { repo, project } = await createTestProject({ withRepo: true });
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        managingOrganization: { reference: 'Organization/' + randomUUID() },
      });
      await client.query(`UPDATE "Patient_References" SET "projectId" = NULL WHERE "resourceId" = $1`, [patient.id]);

      // Rebuilt by the run below, so this proves the index phase still covers the table
      await client.query(`DROP INDEX IF EXISTS "Observation_Refs_projectId_code_targetId_idx"`);

      getConfig().disableChainedSearch = ['Observation'];
      const { statements } = spyQuery();
      let results: MigrationActionResult[];
      try {
        results = await run(SINGLE_RANGE);
      } finally {
        getConfig().disableChainedSearch = undefined;
      }

      expect(results).toContainEqual(
        expect.objectContaining({
          name: 'Skip backfill of reference tables with chained search disabled',
          skipped: 'Observation',
        })
      );
      expect(results.find((r) => r.name === 'Backfill "Observation_References"."projectId"')).toBeUndefined();
      expect(statements.filter((sql) => sql.includes('"Observation_References"'))).toEqual([
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Observation_Refs_projectId_code_targetId_idx" ON "Observation_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")`,
      ]);
      const skipped = await client.query(
        `SELECT 1 FROM "Observation_References" WHERE "resourceId" = $1 AND "projectId" IS NULL`,
        [obsId]
      );
      expect(skipped.rowCount).toBeGreaterThan(0);

      const backfilled = await client.query<{ projectId: string | null }>(
        `SELECT "projectId" FROM "Patient_References" WHERE "resourceId" = $1`,
        [patient.id]
      );
      expect(backfilled.rows.length).toBeGreaterThan(0);
      expect(backfilled.rows.every((r) => r.projectId === project.id)).toBe(true);
    }));
});

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
import { AdaptiveConcurrency, computeRanges, callback as migrationFn } from './v53';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('v53 key ranges', () => {
  test.each([0, 1, 25_000])('gives %i estimated rows a single fully open range', (rowEstimate) => {
    expect(computeRanges(rowEstimate)).toEqual([{ lower: undefined, upper: undefined }]);
  });

  // An overlap hands two workers the same rows; a gap silently leaves rows NULL
  test('tiles the uuid space with no gaps and no overlaps', () => {
    const ranges = computeRanges(1_000_000, 25_000);
    expect(ranges).toHaveLength(40);
    expect(ranges[0].lower).toBeUndefined();
    expect(ranges[ranges.length - 1].upper).toBeUndefined();

    for (let i = 0; i < ranges.length - 1; i++) {
      expect(ranges[i].upper).toMatch(UUID_PATTERN);
      expect(ranges[i].upper).toBe(ranges[i + 1].lower);
    }
  });
});

describe('v53 adaptive concurrency', () => {
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

    range(10);
    expect(limiter.limit).toBe(2);
    range(10);
    expect(limiter.limit).toBe(2);
    range(10);
    expect(limiter.limit).toBe(3);

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
  });

  test('ignores ranges that started before the last adjustment', () => {
    const limiter = new AdaptiveConcurrency(4, TARGET_MS, BACKOFF_MS);
    const range = clock(limiter);
    while (limiter.limit < 4) {
      range(10);
    }

    // Four ranges slowed by the same pressure must not cascade the limit down to one
    const start = 1_000_000;
    for (let i = 0; i < 4; i++) {
      limiter.record(start, start + BACKOFF_MS + i);
    }
    expect(limiter.limit).toBe(2);
  });

  test('signals only changes of the limit, until the listener unsubscribes', () => {
    const limiter = new AdaptiveConcurrency(4, TARGET_MS, BACKOFF_MS);
    const range = clock(limiter);
    const listener = vi.fn();
    const unsubscribe = limiter.onLimitChange(listener);

    range(TARGET_MS + 1);
    expect(listener).not.toHaveBeenCalled();
    range(10);
    expect(listener).toHaveBeenCalledTimes(1);
    range(BACKOFF_MS);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    range(10);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('v53', () => {
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

  const BACKFILL_NAME = 'Backfill "Observation_References"."projectId"';
  const SINGLE_RANGE: BackfillOverrides = { rangeTargetRows: Number.MAX_SAFE_INTEGER };
  const BEGIN = expect.stringMatching(
    /^BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL statement_timeout TO '[^']+'; SET LOCAL idle_in_transaction_session_timeout TO '[^']+'$/
  );
  const BEGIN_WITHOUT_SEQSCAN = expect.stringMatching(
    /^BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL statement_timeout TO '[^']+'; SET LOCAL idle_in_transaction_session_timeout TO '[^']+'; SET LOCAL enable_seqscan = off$/
  );
  const OBSERVATION_INDEX = 'Observation_Refs_projectId_code_targetId_idx';
  const CREATE_OBSERVATION_INDEX = `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${OBSERVATION_INDEX}" ON "Observation_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")`;

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

  function lastSaved(job: Job<CustomPostDeployMigrationJobData>): ProjectIdBackfillJobData {
    return vi.mocked(job.updateData).mock.calls.at(-1)?.[0] as ProjectIdBackfillJobData;
  }

  function backfillResult(results: MigrationActionResult[]): MigrationActionResult | undefined {
    return results.find((r) => r.name === BACKFILL_NAME);
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

  // Unlike the per-range counts, the full-table count has no key range to narrow its scan
  function isFullTableCount(sql: string): boolean {
    return sql.includes('count(*) AS remaining') && !sql.includes('::uuid');
  }

  function isRangeStatement(sql: string): boolean {
    return sql.includes('UPDATE "Observation_References"') || sql.includes('DELETE FROM "Observation_References" r');
  }

  function indexesWhere(statements: string[], predicate: (sql: string) => boolean): number[] {
    return statements.flatMap((sql, i) => (predicate(sql) ? [i] : []));
  }

  function rangeOf(sql: string, params: string[]): { lower?: string; upper?: string } {
    const hasLower = sql.includes('>= $1::uuid');
    return {
      lower: hasLower ? params[0] : undefined,
      upper: sql.includes(`< $${hasLower ? 2 : 1}::uuid`) ? params[hasLower ? 1 : 0] : undefined,
    };
  }

  function rangeContains(range: { lower?: string; upper?: string }, id: string): boolean {
    return (range.lower === undefined || id >= range.lower) && (range.upper === undefined || id < range.upper);
  }

  async function timeOut(original: QueryFn): Promise<unknown> {
    await original(`SET LOCAL statement_timeout TO '10ms'`);
    return original('SELECT pg_sleep(1)');
  }

  // For job data where every other table is already complete: a table completing resets
  // `transientFailures`, so tests of that counter must leave no other table for the run to complete
  async function referenceTypesExcept(...except: string[]): Promise<string[]> {
    const result = await client.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE '%\\_References'`
    );
    return result.rows
      .map((row) => row.relname.replace(/_References$/, ''))
      .filter((resourceType) => !except.includes(resourceType));
  }

  async function isIndexValid(indexName: string): Promise<boolean | undefined> {
    const result = await client.query<{ indisvalid: boolean }>(
      `SELECT i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = $1`,
      [indexName]
    );
    return result.rows[0]?.indisvalid;
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
      const orphanId = await insertOrphan();

      const results = await run();

      await expectBackfilled(ids, projectId);
      const orphans = await client.query(`SELECT 1 FROM "Observation_References" WHERE "resourceId" = $1`, [orphanId]);
      expect(orphans.rowCount).toBe(0);
      expect(backfillResult(results)).toMatchObject({ updated: 2, orphansDeleted: 1, remaining: 0 });

      // Finding no remaining work is what makes an interrupted run resumable
      expect(backfillResult(await run())).toBeUndefined();
    }));

  test('finishes the table when a resource is purged while the backfill is in flight', () =>
    withTestContext(async () => {
      const {
        ids: [obsId],
      } = await createNulledObservations(1);

      // Rows that can never be updated must not be mistaken for "no work remains"
      spyQuery(
        onFirstBackfill(async () => {
          await getDatabasePool(DatabaseMode.WRITER).query(`DELETE FROM "Observation" WHERE id = $1`, [obsId]);
        })
      );

      const results = await run();

      expect(backfillResult(results)).toMatchObject({ remaining: 0 });
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

        // A freshly added column has no statistics, so the planner needs them before any table is touched
        expect(results[0].name).toBe('Analyze reference table "projectId" columns');
        const firstAnalyze = statements.findIndex((sql) => sql.startsWith('ANALYZE'));
        const firstBackfill = statements.findIndex((sql) => sql.includes('UPDATE "Observation_References"'));
        expect(firstAnalyze).toBeGreaterThanOrEqual(0);
        expect(firstAnalyze).toBeLessThan(firstBackfill);

        expect(backfillResult(results)?.ranges).toBe(1);
        const rangeIndexes = indexesWhere(statements, isRangeStatement);
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
        const results = await run({ rangeTargetRows: 1 });
        const statements = calls.map((c) => c.sql);

        expect(backfillResult(results)?.ranges).toBeGreaterThan(1);

        const rangeIndexes = indexesWhere(statements, isRangeStatement);
        expect(rangeIndexes.length).toBeGreaterThan(2);
        for (const i of rangeIndexes) {
          expect(statements[i - 1]).toEqual(BEGIN_WITHOUT_SEQSCAN);
          expect(statements[i + 1]).toBe('COMMIT');
        }

        // Sweeping while the range's pages are cached avoids a second full read of the table
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

    test('delays the job when a whole-table range times out again with seq scans off', () =>
      withTestContext(async () => {
        await createNulledObservations(1);
        const job = mockJob();

        let timedOut = 0;
        const { statements } = spyQuery((sql, _args, original) => {
          if (sql.includes('UPDATE "Observation_References"')) {
            timedOut++;
            return timeOut(original);
          }
          return undefined;
        });

        await expect(run({ job, ...SINGLE_RANGE })).rejects.toThrow(DelayedError);

        expect(timedOut).toBe(2);
        // Counting what the range left is a full scan of a table the database is too loaded to update
        expect(statements.filter(isFullTableCount)).toEqual([]);
        expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
        expect(lastSaved(job)).toMatchObject({ timedOutRanges: { Observation: [{}] }, transientFailures: 1 });
      }));

    test('runs every other range and builds every index before delaying the job for a keyed range that timed out', () =>
      withTestContext(async () => {
        const { ids, projectId } = await createNulledObservations(5);
        await client.query(`DROP INDEX IF EXISTS "${OBSERVATION_INDEX}"`);
        const job = mockJob();

        let updates = 0;
        let timedOutRange: { lower?: string; upper?: string } | undefined;
        let timedOutParams: unknown[] = [];
        spyQuery((sql, args, original) => {
          if (!sql.includes('UPDATE "Observation_References"')) {
            return undefined;
          }
          updates++;
          const range = rangeOf(sql, args[1]);
          // Time out a range that holds one of the rows, or the table would converge anyway
          if (!timedOutRange && rangeContains(range, ids[0])) {
            timedOutRange = range;
            timedOutParams = args[1];
            return timeOut(original);
          }
          return undefined;
        });

        const results: MigrationActionResult[] = [];
        await expect(run({ job, rangeTargetRows: 1, results })).rejects.toThrow(DelayedError);

        const backfill = backfillResult(results);
        expect(backfill).toMatchObject({ passes: 1, timedOutRanges: 1 });
        expect(updates).toBe(backfill?.ranges);
        expect(await isIndexValid(OBSERVATION_INDEX)).toBe(true);
        const saved = lastSaved(job);
        expect(saved).toMatchObject({ timedOutRanges: { Observation: [timedOutRange] }, transientFailures: 1 });
        expect(saved.completedResourceTypes).not.toContain('Observation');

        // The next attempt retries only the range that timed out
        vi.restoreAllMocks();
        const { calls } = spyQuery();
        await run({ rangeTargetRows: 1, data: saved });

        const update = calls.find((c) => c.sql.includes('UPDATE "Observation_References"'));
        expect(update?.params).toEqual(timedOutParams);
        await expectBackfilled(ids, projectId);
      }));

    test.each([
      { name: 'once transient failures have exhausted their restarts', withJob: true },
      { name: 'when there is no job to delay', withJob: false },
    ])('fails the job on a range timeout $name', ({ withJob }) =>
      withTestContext(async () => {
        await createNulledObservations(1);
        const data: ProjectIdBackfillJobData = {
          ...jobData,
          completedResourceTypes: await referenceTypesExcept('Observation'),
          transientFailures: 5,
        };
        const job = withJob ? mockJob(data) : undefined;
        spyQuery((sql, _args, original) =>
          sql.includes('UPDATE "Observation_References"') ? timeOut(original) : undefined
        );

        await expect(run({ job, data, ...SINGLE_RANGE })).rejects.toThrow(/timed out/);
        if (job) {
          expect(job.moveToDelayed).not.toHaveBeenCalled();
        }
      })
    );

    test.each([
      { failure: 'a statement timeout', inject: timeOut, retryBegin: BEGIN_WITHOUT_SEQSCAN },
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

        expect(backfillResult(results)).toMatchObject({ remaining: 0 });
        const updates = indexesWhere(statements, (sql) => sql.includes('UPDATE "Observation_References"'));
        expect(updates.length).toBeGreaterThanOrEqual(2);
        expect(statements.slice(updates[0] + 1, updates[1])).toEqual(['ROLLBACK', retryBegin]);
      })
    );

    test('rolls back a range transaction whose setup fails after it began', () =>
      withTestContext(async () => {
        await createNulledObservations(1);

        let failed = false;
        const { statements } = spyQuery((sql, _args, original) => {
          if (!failed && sql.startsWith('BEGIN ISOLATION LEVEL READ COMMITTED')) {
            failed = true;
            // BEGIN takes effect, then the bad setting aborts the transaction
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
    test('backfills every row when key ranges run in parallel', () =>
      withTestContext(async () => {
        const { ids, projectId } = await createNulledObservations(20);

        const { results, rangesPerWorker } = await withWorkers(3, async (workers) => {
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
          const results = await run({
            concurrency: workers.length,
            clients: workers,
            rangeTargetRows: 1,
            rangeTargetMs: Number.MAX_SAFE_INTEGER,
          });
          return { results, rangesPerWorker };
        });

        expect(backfillResult(results)?.ranges).toBeGreaterThan(1);
        expect(backfillResult(results)?.concurrency).toBe(3);
        expect(rangesPerWorker.every((count) => count > 0)).toBe(true);
        await expectBackfilled(ids, projectId);
      }));

    test('returns every worker connection it checked out', () =>
      withTestContext(async () => {
        await createNulledObservations(1);
        const pool = getDatabasePool(DatabaseMode.WRITER);
        const before = pool.totalCount;

        // No `clients` override, so the migration acquires and releases its own connections
        await migrationFn(client, [], undefined, jobData, { concurrency: 2, ...SINGLE_RANGE });

        expect(pool.waitingCount).toBe(0);
        expect(pool.totalCount).toBeLessThanOrEqual(before);
      }));
  });

  describe('shutdown and failures', () => {
    test.each([
      { name: 'one worker', workers: 1, overrides: {} },
      { name: 'several workers in flight', workers: 3, overrides: { rangeTargetRows: 1 } },
      // Every range is slow, so only worker 0 leaving the loop can wake the held-back workers
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
        expect(lastSaved(job)).toMatchObject({ resumeFromResourceType: 'Observation' });
      })
    );

    test.each([
      { name: 'delays the job when the database connection is lost', code: '57P01', transientFailures: 0, delays: true },
      {
        name: 'delays the job when an idle range transaction ends its session',
        code: '25P03',
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
        const data: ProjectIdBackfillJobData = {
          ...jobData,
          completedResourceTypes: await referenceTypesExcept('Observation'),
          ...(transientFailures ? { transientFailures } : {}),
        };
        const job = mockJob(data);

        spyQuery((sql) => {
          if (sql.includes('UPDATE "Observation_References"')) {
            throw Object.assign(new Error('terminating connection due to administrator command'), { code });
          }
          return undefined;
        });

        if (delays) {
          await expect(run({ job, data })).rejects.toThrow(DelayedError);
          expect(lastSaved(job)).toMatchObject({ resumeFromResourceType: 'Observation', transientFailures: 1 });
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

    test('resets transient failures once a table completes', () =>
      withTestContext(async () => {
        await createNulledObservations(1);
        const data: ProjectIdBackfillJobData = {
          ...jobData,
          completedResourceTypes: await referenceTypesExcept('Observation'),
          transientFailures: 3,
        };
        const job = mockJob(data);

        await run({ job, data, ...SINGLE_RANGE });

        expect(lastSaved(job)).toMatchObject({
          completedResourceTypes: expect.arrayContaining(['Observation']),
          transientFailures: 0,
        });
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
        expect(lastSaved(job)).toMatchObject({
          resumeFromResourceType: undefined,
          completedResourceTypes: expect.arrayContaining(['Observation']),
        });
        expect(job.moveToDelayed).not.toHaveBeenCalled();
      }));

    test('skips ranges below the resume point when resuming a table mid-backfill', () =>
      withTestContext(async () => {
        // Work above the resume point; everything below it is done
        await insertOrphan('f0000000-0000-4000-8000-000000000001');
        const data: ProjectIdBackfillJobData = {
          ...jobData,
          resumeFromResourceType: 'Observation',
          resumeFromResourceId: '40000000-0000-0000-0000-000000000000',
          resumeStep: 'backfill',
        };

        const { statements } = spyQuery();
        const results = await run({ rangeTargetRows: 1, data });

        const backfill = backfillResult(results);
        expect(backfill).toMatchObject({ passes: 1, orphansDeleted: 1 });
        const ranges = backfill?.ranges as number;
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
        expect(backfillResult(results)).toMatchObject({ passes: 2, orphansDeleted: 1, remaining: 0 });
      }));

    test.each([
      {
        name: 'a table an earlier attempt proved complete',
        resume: { completedResourceTypes: ['Observation'] },
        completed: true,
      },
      {
        name: 'the table an earlier attempt was partway through',
        resume: { resumeFromResourceType: 'Observation', resumeStep: 'verify' },
        completed: false,
      },
      { name: 'a table no attempt has backfilled', resume: {}, completed: false },
    ])('vacuums $name before building its index', ({ resume, completed }) =>
      withTestContext(async () => {
        if (completed) {
          await createNulledObservations(1);
        }
        await client.query(`DROP INDEX IF EXISTS "${OBSERVATION_INDEX}"`);

        const { statements } = spyQuery();
        await run({ ...SINGLE_RANGE, data: { ...jobData, ...resume } });

        // Skipping the table this attempt does not undo the bloat the previous one left behind
        expect(statements).toContain('VACUUM (ANALYZE) "Observation_References"');
        if (completed) {
          expect(statements.some((sql) => sql.includes('UPDATE "Observation_References"'))).toBe(false);
        }
      })
    );
  });

  describe('index phase', () => {
    test('drops a leftover invalid index concurrently, after vacuuming, and rebuilds it', () =>
      withTestContext(async () => {
        await client.query(CREATE_OBSERVATION_INDEX);
        // What a build interrupted partway leaves behind
        await client.query(
          `UPDATE pg_index SET indisvalid = false FROM pg_class
           WHERE pg_class.oid = pg_index.indexrelid AND pg_class.relname = $1`,
          [OBSERVATION_INDEX]
        );

        const { statements } = spyQuery();
        await run(SINGLE_RANGE);

        const vacuum = statements.indexOf('VACUUM (ANALYZE) "Observation_References"');
        expect(statements.slice(vacuum).filter((sql) => sql.includes('"Observation_'))).toEqual([
          'VACUUM (ANALYZE) "Observation_References"',
          `DROP INDEX CONCURRENTLY IF EXISTS "public"."${OBSERVATION_INDEX}"`,
          CREATE_OBSERVATION_INDEX,
        ]);
        expect(await isIndexValid(OBSERVATION_INDEX)).toBe(true);
      }));

    const PATIENT_INDEX = 'Patient_Refs_projectId_code_targetId_idx';

    /**
     * Runs `fn` while another session's build of the Observation index is held in its wait for
     * writers, which is what a process killed mid-build leaves running.
     * @param fn - Runs while the build is in progress.
     */
    async function withObservationIndexBuildInProgress(fn: () => Promise<void>): Promise<void> {
      await client.query(`DROP INDEX IF EXISTS "${OBSERVATION_INDEX}"`);
      await client.query(`DROP INDEX IF EXISTS "${PATIENT_INDEX}"`);
      // Otherwise the analyze phase waits on the build's lock on the table
      await client.query(`ANALYZE "Observation_References" ("projectId")`);

      await withWorkers(2, async ([locker, builder]) => {
        await locker.query(`SET idle_in_transaction_session_timeout TO 0`);
        await builder.query(`SET statement_timeout TO 0`);
        // A lock rather than an open snapshot: every build in the database waits out old snapshots
        await locker.query(`BEGIN; LOCK TABLE "Observation_References" IN ROW EXCLUSIVE MODE`);
        const build = builder.query(CREATE_OBSERVATION_INDEX);
        try {
          await vi.waitFor(async () => {
            const progress = await client.query(
              `SELECT phase FROM pg_stat_progress_create_index WHERE relid = '"Observation_References"'::regclass`
            );
            expect(progress.rows).toEqual([{ phase: 'waiting for writers before build' }]);
          });
          expect(await isIndexValid(OBSERVATION_INDEX)).toBe(false);
          await fn();
        } finally {
          await locker.query('COMMIT');
          await build;
        }
      });
      expect(await isIndexValid(OBSERVATION_INDEX)).toBe(true);
    }

    test('delays the job while another session is building an index on a table, and builds the rest', () =>
      withTestContext(async () => {
        const data: ProjectIdBackfillJobData = {
          ...jobData,
          completedResourceTypes: await referenceTypesExcept(),
          transientFailures: 2,
        };
        const job = mockJob(data);

        await withObservationIndexBuildInProgress(async () => {
          const { statements } = spyQuery();
          const before = Date.now();
          await expect(run({ job, data })).rejects.toThrow(DelayedError);

          expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
          expect(statements.filter((sql) => sql.includes('"Observation_References"'))).toEqual([]);
          expect(await isIndexValid(PATIENT_INDEX)).toBe(true);
          // Waiting out a build is not a failure, so it must not use up the restarts
          const saved = lastSaved(job);
          expect(saved).toMatchObject({ transientFailures: 2 });
          expect(saved.deferredSince).toBeGreaterThanOrEqual(before);
        });
      }));

    test('keeps the time it started waiting across attempts, and fails the job once it has waited too long', () =>
      withTestContext(async () => {
        const startedWaiting = Date.now() - 60_000;
        const data: ProjectIdBackfillJobData = {
          ...jobData,
          completedResourceTypes: await referenceTypesExcept(),
          deferredSince: startedWaiting,
        };
        const stale: ProjectIdBackfillJobData = { ...data, deferredSince: Date.now() - 7 * 24 * 60 * 60 * 1000 };
        const job = mockJob(data);
        const staleJob = mockJob(stale);

        await withObservationIndexBuildInProgress(async () => {
          await expect(run({ job, data })).rejects.toThrow(DelayedError);
          expect(lastSaved(job)).toMatchObject({ deferredSince: startedWaiting });

          await expect(run({ job: staleJob, data: stale })).rejects.toThrow(/index build in progress/);
          expect(staleJob.moveToDelayed).not.toHaveBeenCalled();
        });
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
      await client.query(`DROP INDEX IF EXISTS "${OBSERVATION_INDEX}"`);

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
      expect(backfillResult(results)).toBeUndefined();
      expect(statements.filter((sql) => sql.includes('"Observation_References"'))).toEqual([
        'VACUUM (ANALYZE) "Observation_References"',
        CREATE_OBSERVATION_INDEX,
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

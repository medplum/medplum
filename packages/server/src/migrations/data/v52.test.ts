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
import type { BackfillOverrides, ProjectIdBackfillJobData } from './v52';
import { AdaptiveConcurrency, computeRanges, callback as migrationFn, uuidPartition } from './v52';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('v51 key ranges', () => {
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

describe('v51 adaptive concurrency', () => {
  const TARGET_MS = 100;
  const BACKOFF_MS = 300;

  /**
   * Feeds ranges on a synthetic clock, each starting where the previous one finished.
   * @param limiter - The limiter to feed.
   * @returns A function recording one range of the given duration.
   */
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

  test('signals every change of the limit, and only a change', () => {
    const limiter = new AdaptiveConcurrency(4, TARGET_MS, BACKOFF_MS);
    const range = clock(limiter);
    const listener = vi.fn();
    limiter.onLimitChange(listener);

    range(TARGET_MS + 1);
    expect(limiter.limit).toBe(1);
    expect(listener).not.toHaveBeenCalled();
    range(10);
    expect(limiter.limit).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
    range(BACKOFF_MS);
    expect(limiter.limit).toBe(1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('stops signalling a listener once it unsubscribes', () => {
    const limiter = new AdaptiveConcurrency(4, TARGET_MS, BACKOFF_MS);
    const range = clock(limiter);
    const listener = vi.fn();

    // One limiter outlives every table's run, so a listener left behind by each would accumulate
    // for the whole migration
    const unsubscribe = limiter.onLimitChange(listener);
    unsubscribe();
    range(10);
    expect(limiter.limit).toBe(2);
    expect(listener).not.toHaveBeenCalled();
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

describe('v51', () => {
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

  const jobData: CustomPostDeployMigrationJobData = {
    type: 'custom',
    target: { kind: 'shard', shardId: TODO_SHARD_ID },
    tracking: { owner: 'system', asyncJobId: randomUUID() },
  };

  /**
   * Runs the migration against the single client these tests spy on, so every statement the
   * migration issues is observable. Concurrency and range sizing are seams the production caller
   * does not use; `runCustomMigration` invokes the callback with four arguments.
   * @param job - The BullMQ job, when the test needs shutdown handling.
   * @param overrides - Concurrency, worker connections, and range sizing.
   * @param data - Job data, for exercising resume state.
   * @returns The migration action results.
   */
  async function run(
    job?: Job<CustomPostDeployMigrationJobData>,
    overrides: BackfillOverrides = {},
    data: CustomPostDeployMigrationJobData = jobData
  ): Promise<MigrationActionResult[]> {
    const results: MigrationActionResult[] = [];
    await migrationFn(client, results, job, data, { concurrency: 1, clients: [client], ...overrides });
    return results;
  }

  /** Forces exactly one range per table, whatever other test files left in the shared tables. */
  const SINGLE_RANGE: BackfillOverrides = { rangeTargetRows: Number.MAX_SAFE_INTEGER };

  function interceptBackfillUpdate(onBackfill: () => void | Promise<void>): () => void {
    const originalQuery = client.query.bind(client);
    let fired = false;
    const spy = vi.spyOn(client, 'query').mockImplementation((async (...args: any[]) => {
      const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
      if (!fired && typeof sql === 'string' && sql.includes('UPDATE "Observation_References"')) {
        fired = true;
        await onBackfill();
      }
      return (originalQuery as any)(...args);
    }) as typeof client.query);
    return () => spy.mockRestore();
  }

  function captureSql(): { statements: string[]; restore: () => void } {
    const originalQuery = client.query.bind(client);
    const statements: string[] = [];
    const spy = vi.spyOn(client, 'query').mockImplementation((async (...args: any[]) => {
      const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
      if (typeof sql === 'string') {
        statements.push(sql);
      }
      return (originalQuery as any)(...args);
    }) as typeof client.query);
    return { statements, restore: () => spy.mockRestore() };
  }

  async function createNulledObservation(): Promise<Observation> {
    const { repo } = await createTestProject({ withRepo: true });
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    const obs = await repo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '3141-9' }] },
      subject: createReference(patient),
    });
    // Writes populate projectId, so simulate rows written before this migration's release
    await client.query(`UPDATE "Observation_References" SET "projectId" = NULL WHERE "resourceId" = $1`, [obs.id]);
    return obs;
  }

  function observationResult(results: MigrationActionResult[]): MigrationActionResult | undefined {
    return results.find((r) => r.name === 'Backfill "Observation_References"."projectId"');
  }

  test('backfills projectId, deletes orphans, and is a no-op on a second run', () =>
    withTestContext(async () => {
      const { repo, project } = await createTestProject({ withRepo: true });
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
      const obs = await repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: '3141-9' }] },
        subject: createReference(patient),
      });

      // Writes populate projectId, so simulate rows written before this migration's release
      await client.query(`UPDATE "Observation_References" SET "projectId" = NULL WHERE "resourceId" = $1`, [obs.id]);

      // A reference row whose referencing resource does not exist
      const orphanId = randomUUID();
      await client.query(
        `INSERT INTO "Observation_References" ("resourceId", "targetId", "code") VALUES ($1, $2, 'subject')`,
        [orphanId, patient.id]
      );

      const results = await run();

      const rows = await client.query<{ projectId: string | null }>(
        `SELECT "projectId" FROM "Observation_References" WHERE "resourceId" = $1`,
        [obs.id]
      );
      expect(rows.rows).toHaveLength(2); // patient and subject
      expect(rows.rows.every((r) => r.projectId === project.id)).toBe(true);

      const orphans = await client.query(`SELECT 1 FROM "Observation_References" WHERE "resourceId" = $1`, [orphanId]);
      expect(orphans.rowCount).toBe(0);

      expect(observationResult(results)).toMatchObject({ updated: 2, orphansDeleted: 1, remaining: 0 });

      // Running again finds no remaining work, which is what makes an interrupted run resumable
      expect(observationResult(await run())).toBeUndefined();
    }));

  test('yields to a graceful shutdown between batches of one table', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();

      let closing = false;
      const isClosingSpy = vi.spyOn(queueRegistry, 'isClosing').mockImplementation(() => closing);
      // The queue starts closing only once the table's backfill is already under way, so a check
      // made solely between tables cannot observe it
      const restoreQuery = interceptBackfillUpdate(() => {
        closing = true;
      });

      const job = {
        id: '1',
        queueName: 'TestQueue',
        token: 'token',
        updateData: vi.fn(),
        moveToDelayed: vi.fn(),
      } as unknown as Job<CustomPostDeployMigrationJobData>;

      try {
        await expect(run(job)).rejects.toThrow(DelayedError);
        expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({ resumeFromResourceType: 'Observation' }));
      } finally {
        restoreQuery();
        isClosingSpy.mockRestore();
        // Left NULL by the interrupted run, where it would read as unfinished work to later tests
        await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = $1`, [obs.id]);
      }
    }));

  test('finishes the table when a resource is purged while the backfill is in flight', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();

      // A hard delete landing while the backfill is in flight leaves rows that can never be
      // updated, which must not be mistaken for "no work remains". The orphan sweep runs after the
      // backfill, so it still sees them.
      const restoreQuery = interceptBackfillUpdate(async () => {
        await getDatabasePool(DatabaseMode.WRITER).query(`DELETE FROM "Observation" WHERE id = $1`, [obs.id]);
      });

      let results: MigrationActionResult[];
      try {
        results = await run();
      } finally {
        restoreQuery();
      }

      expect(observationResult(results)).toMatchObject({ remaining: 0 });
      const rows = await client.query(`SELECT 1 FROM "Observation_References" WHERE "resourceId" = $1`, [obs.id]);
      expect(rows.rowCount).toBe(0);
    }));

  test('establishes projectId statistics on every table before backfilling any of them', () =>
    withTestContext(async () => {
      await createNulledObservation();

      const { statements, restore } = captureSql();
      let results: MigrationActionResult[];
      try {
        results = await run(undefined, SINGLE_RANGE);
      } finally {
        restore();
      }

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
    }));

  test('sweeps each range right behind its own backfill', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();
      const orphanId = randomUUID();
      await insertOrphan(orphanId);

      const originalQuery = client.query.bind(client);
      const rangeStatements: { kind: 'backfill' | 'sweep'; params: unknown[] }[] = [];
      const spy = vi.spyOn(client, 'query').mockImplementation((async (...args: any[]) => {
        const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
        if (typeof sql === 'string' && sql.includes('UPDATE "Observation_References"')) {
          rangeStatements.push({ kind: 'backfill', params: args[1] ?? [] });
        } else if (typeof sql === 'string' && sql.includes('DELETE FROM "Observation_References" r')) {
          rangeStatements.push({ kind: 'sweep', params: args[1] ?? [] });
        }
        return (originalQuery as any)(...args);
      }) as typeof client.query);
      try {
        await run(undefined, { rangeTargetRows: 1 });
      } finally {
        spy.mockRestore();
      }

      // Sweeping while the range's pages are still cached, rather than in a second pass over the
      // whole table, is what keeps the sweep from costing a second full read. Backfilling first
      // leaves only orphans NULL in the range.
      expect(rangeStatements.filter((s) => s.kind === 'backfill').length).toBeGreaterThan(1);
      for (let i = 0; i < rangeStatements.length; i += 2) {
        expect(rangeStatements[i].kind).toBe('backfill');
        expect(rangeStatements[i + 1]).toEqual({ kind: 'sweep', params: rangeStatements[i].params });
      }

      const remaining = await client.query(
        `SELECT 1 FROM "Observation_References" WHERE "resourceId" = ANY($1::uuid[]) AND "projectId" IS NULL`,
        [[obs.id, orphanId]]
      );
      expect(remaining.rowCount).toBe(0);
    }));

  test('leaves rows NULL when the referencing resource has no project', () =>
    withTestContext(async () => {
      const { repo, project } = await createTestProject({ withRepo: true });
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
      const bodyStructure = await repo.createResource<BodyStructure>({
        resourceType: 'BodyStructure',
        patient: createReference(patient),
      });

      // A resource with no project cannot supply one. Backfilling from it would write NULL over
      // NULL, re-select the same rows on the next iteration, and never finish; the rows have to be
      // left alone instead. `projectId` is NOT NULL on every resource table, so the state has to be
      // constructed here rather than reached through the repo.
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
      const obs = await createNulledObservation();

      // Post-deploy migrations never re-run, so a table that did not converge has to fail the job
      // and leave the data version where it is, rather than reporting success over NULL rows that
      // would block the NOT NULL constraint in a later release.
      const originalQuery = client.query.bind(client);
      const spy = vi.spyOn(client, 'query').mockImplementation((async (...args: any[]) => {
        const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
        if (typeof sql === 'string' && sql.includes('UPDATE "Observation_References"')) {
          return { rowCount: 0, rows: [] };
        }
        return (originalQuery as any)(...args);
      }) as typeof client.query);

      try {
        await expect(run()).rejects.toThrow(/did not converge.*Observation_References/);
      } finally {
        spy.mockRestore();
        await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = $1`, [obs.id]);
      }
    }));

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
    await client.query(`UPDATE "Observation_References" SET "projectId" = NULL WHERE "resourceId" = ANY($1::uuid[])`, [
      ids,
    ]);
    return { ids, projectId: project.id };
  }

  /**
   * Runs the migration across three dedicated worker connections, counting the Observation ranges
   * each one ran.
   * @param overrides - Range sizing and timing.
   * @returns The migration action results and the per-worker range counts.
   */
  async function runOnWorkers(
    overrides: BackfillOverrides
  ): Promise<{ results: MigrationActionResult[]; rangesPerWorker: number[] }> {
    const pool = getDatabasePool(DatabaseMode.WRITER);
    const workers = [await pool.connect(), await pool.connect(), await pool.connect()];
    const rangesPerWorker = workers.map(() => 0);
    try {
      workers.forEach((worker, i) => {
        const original = worker.query.bind(worker);
        vi.spyOn(worker, 'query').mockImplementation((async (...args: any[]) => {
          const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
          if (typeof sql === 'string' && sql.includes('UPDATE "Observation_References"')) {
            rangesPerWorker[i]++;
          }
          return (original as any)(...args);
        }) as typeof worker.query);
      });
      const results = await run(undefined, { concurrency: workers.length, clients: workers, ...overrides });
      return { results, rangesPerWorker };
    } finally {
      for (const worker of workers) {
        worker.release(true);
      }
    }
  }

  async function expectBackfilled(ids: string[], projectId: string): Promise<void> {
    const rows = await client.query<{ projectId: string | null }>(
      `SELECT "projectId" FROM "Observation_References" WHERE "resourceId" = ANY($1::uuid[])`,
      [ids]
    );
    expect(rows.rows).toHaveLength(ids.length * 2); // patient and subject per observation
    expect(rows.rows.every((r) => r.projectId === projectId)).toBe(true);
  }

  test('backfills every row when key ranges run in parallel', () =>
    withTestContext(async () => {
      const { ids, projectId } = await createNulledObservations(20);

      // One row per range spreads the resources over many ranges claimed concurrently. Every range
      // counts as fast, so the limiter admits every worker however slow the machine is, and a
      // held-back worker wakes the moment it is admitted rather than after worker 0 has run ahead.
      const { results, rangesPerWorker } = await runOnWorkers({
        rangeTargetRows: 1,
        rangeTargetMs: Number.MAX_SAFE_INTEGER,
      });

      // A gap between ranges would leave rows NULL, which is self-detecting: the table then fails
      // to converge and `run` throws before reaching this point
      expect(observationResult(results)?.ranges).toBeGreaterThan(1);
      expect(observationResult(results)?.concurrency).toBe(3);
      // Every worker pulled ranges, rather than one of them doing all the work
      expect(rangesPerWorker.every((count) => count > 0)).toBe(true);
      await expectBackfilled(ids, projectId);
    }));

  test('stays on one worker while every range is slower than its target', () =>
    withTestContext(async () => {
      const { ids, projectId } = await createNulledObservations(5);

      // Every range counts as slow, as on a database already saturated by live traffic. Workers 1
      // and 2 are held back throughout, so finishing at all means running out of ranges released them.
      const { results, rangesPerWorker } = await runOnWorkers({ rangeTargetRows: 1, rangeTargetMs: 0 });

      expect(observationResult(results)?.ranges).toBeGreaterThan(1);
      expect(observationResult(results)?.concurrency).toBe(1);
      expect(rangesPerWorker[0]).toBeGreaterThan(0);
      expect(rangesPerWorker.slice(1)).toEqual([0, 0]);
      await expectBackfilled(ids, projectId);
    }));

  // Sent as one simple query, so opening each range's transaction costs a single round trip
  const BEGIN = expect.stringMatching(/^BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL statement_timeout TO '[^']+'$/);
  const BEGIN_WITHOUT_SEQSCAN = expect.stringMatching(
    /^BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL statement_timeout TO '[^']+'; SET LOCAL enable_seqscan = off$/
  );

  function isObservationRangeStatement(sql: string): boolean {
    return sql.includes('UPDATE "Observation_References"') || sql.includes('DELETE FROM "Observation_References" r');
  }

  test('disables sequential scans while a table runs as keyed ranges', () =>
    withTestContext(async () => {
      await createNulledObservation();

      const { statements, restore } = captureSql();
      let results: MigrationActionResult[];
      try {
        // One row per range forces the keyed-range path rather than a single whole-table statement
        results = await run(undefined, { rangeTargetRows: 1 });
      } finally {
        restore();
      }

      expect(observationResult(results)?.ranges).toBeGreaterThan(1);
      // The range bound makes the reference table a primary key range scan on its own, but the
      // planner still seq scans the resource table once per range unless told not to. Scoping the
      // setting to each range's own transaction means nothing has to restore it afterward.
      const rangeIndexes = statements.flatMap((sql, i) => (isObservationRangeStatement(sql) ? [i] : []));
      expect(rangeIndexes.length).toBeGreaterThan(2);
      for (const i of rangeIndexes) {
        expect(statements[i - 1]).toEqual(BEGIN_WITHOUT_SEQSCAN);
        expect(statements[i + 1]).toBe('COMMIT');
      }
      expect(statements.filter((sql) => /^SET (enable_seqscan|statement_timeout)/.test(sql))).toEqual([]);
    }));

  test('leaves sequential scans enabled for a single whole-table statement', () =>
    withTestContext(async () => {
      await createNulledObservation();

      const { statements, restore } = captureSql();
      let results: MigrationActionResult[];
      try {
        results = await run(undefined, SINGLE_RANGE);
      } finally {
        restore();
      }

      // An unbounded statement matches every row, which is what a sequential scan is for
      expect(observationResult(results)?.ranges).toBe(1);
      const rangeIndexes = statements.flatMap((sql, i) => (isObservationRangeStatement(sql) ? [i] : []));
      expect(rangeIndexes).toHaveLength(2);
      for (const i of rangeIndexes) {
        expect(statements[i - 1]).toEqual(BEGIN);
        expect(statements[i + 1]).toBe('COMMIT');
      }
      expect(statements.filter((sql) => sql.includes('enable_seqscan'))).toEqual([]);
    }));

  test('abandons a range that hits the statement timeout', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();

      // A real timeout rather than a mocked throw: only Postgres raising 57014 aborts the
      // transaction, which the next statement on this connection would otherwise fail on with 25P02
      const originalQuery = client.query.bind(client);
      let timedOut = 0;
      const spy = vi.spyOn(client, 'query').mockImplementation((async (...args: any[]) => {
        const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
        if (typeof sql === 'string' && sql.includes('UPDATE "Observation_References"')) {
          timedOut++;
          await (originalQuery as any)(`SET LOCAL statement_timeout TO '10ms'`);
          return (originalQuery as any)('SELECT pg_sleep(1)');
        }
        return (originalQuery as any)(...args);
      }) as typeof client.query);

      const results: MigrationActionResult[] = [];
      try {
        await expect(
          migrationFn(client, results, undefined, jobData, { concurrency: 1, clients: [client], ...SINGLE_RANGE })
        ).rejects.toThrow(/did not converge.*Observation_References/);
      } finally {
        spy.mockRestore();
        await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = $1`, [obs.id]);
      }

      // Once as planned, then once more with sequential scans off. Another pass would only time
      // out the same way, so the table is given up on after the first.
      expect(timedOut).toBe(2);
      expect(observationResult(results)).toMatchObject({ abandonedRanges: 1, passes: 1 });
    }));

  test('retries a timed-out whole-table statement with sequential scans off', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();

      const originalQuery = client.query.bind(client);
      const statements: string[] = [];
      let timedOut = false;
      const spy = vi.spyOn(client, 'query').mockImplementation((async (...args: any[]) => {
        const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
        if (typeof sql === 'string') {
          statements.push(sql);
          if (!timedOut && sql.includes('UPDATE "Observation_References"')) {
            timedOut = true;
            await (originalQuery as any)(`SET LOCAL statement_timeout TO '10ms'`);
            return (originalQuery as any)('SELECT pg_sleep(1)');
          }
        }
        return (originalQuery as any)(...args);
      }) as typeof client.query);

      let results: MigrationActionResult[];
      try {
        results = await run(undefined, SINGLE_RANGE);
      } finally {
        spy.mockRestore();
        await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = $1`, [obs.id]);
      }

      // A bad seq scan plan is the likeliest cause of a timeout, so the retry is on the index plan
      expect(observationResult(results)).toMatchObject({ remaining: 0 });
      expect(observationResult(results)?.abandonedRanges).toBeUndefined();
      const updates = statements.flatMap((sql, i) => (sql.includes('UPDATE "Observation_References"') ? [i] : []));
      expect(updates.length).toBeGreaterThanOrEqual(2);
      expect(statements.slice(updates[0] + 1, updates[1])).toEqual(['ROLLBACK', BEGIN_WITHOUT_SEQSCAN]);
      // The sweep reads the same rows the same way, so it would only time out on the same plan first
      const sweep = statements.findIndex((sql, i) => i > updates[1] && isObservationRangeStatement(sql));
      expect(statements[sweep - 1]).toEqual(BEGIN_WITHOUT_SEQSCAN);
    }));

  test('rolls back a range transaction whose setup fails after it began', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();

      // A real failure inside the preamble: BEGIN takes effect, then the bad setting aborts the
      // transaction, leaving the connection unusable until something rolls it back
      const originalQuery = client.query.bind(client);
      const statements: string[] = [];
      let failed = false;
      const spy = vi.spyOn(client, 'query').mockImplementation((async (...args: any[]) => {
        const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
        if (typeof sql === 'string') {
          statements.push(sql);
          if (!failed && sql.startsWith('BEGIN ISOLATION LEVEL READ COMMITTED')) {
            failed = true;
            return (originalQuery as any)(
              `BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL statement_timeout TO 'bogus'`
            );
          }
        }
        return (originalQuery as any)(...args);
      }) as typeof client.query);

      try {
        await expect(run(undefined, SINGLE_RANGE)).rejects.toThrow(/statement_timeout/);
        const begin = statements.findIndex((sql) => sql.startsWith('BEGIN ISOLATION LEVEL READ COMMITTED'));
        expect(statements[begin + 1]).toBe('ROLLBACK');
      } finally {
        spy.mockRestore();
        await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = $1`, [obs.id]);
      }
    }));

  test('retries a range after a deadlock', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();

      const originalQuery = client.query.bind(client);
      const statements: string[] = [];
      let deadlocked = false;
      const spy = vi.spyOn(client, 'query').mockImplementation((async (...args: any[]) => {
        const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
        if (typeof sql === 'string') {
          statements.push(sql);
          if (!deadlocked && sql.includes('UPDATE "Observation_References"')) {
            deadlocked = true;
            throw Object.assign(new Error('deadlock detected'), { code: '40P01' });
          }
        }
        return (originalQuery as any)(...args);
      }) as typeof client.query);

      let results: MigrationActionResult[];
      try {
        results = await run(undefined, SINGLE_RANGE);
      } finally {
        spy.mockRestore();
        await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = $1`, [obs.id]);
      }

      expect(observationResult(results)).toMatchObject({ remaining: 0 });
      // The failed attempt's transaction is rolled back, and the retry runs in a fresh one
      const updates = statements.flatMap((sql, i) => (sql.includes('UPDATE "Observation_References"') ? [i] : []));
      expect(updates.length).toBeGreaterThanOrEqual(2);
      expect(statements.slice(updates[0] + 1, updates[1])).toEqual(['ROLLBACK', BEGIN]);
    }));

  test('delays the job exactly once when the queue closes with several workers in flight', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();

      let closing = false;
      const isClosingSpy = vi.spyOn(queueRegistry, 'isClosing').mockImplementation(() => closing);
      const job = {
        id: '1',
        queueName: 'TestQueue',
        token: 'token',
        updateData: vi.fn(),
        moveToDelayed: vi.fn(),
      } as unknown as Job<CustomPostDeployMigrationJobData>;

      const pool = getDatabasePool(DatabaseMode.WRITER);
      const workers = [await pool.connect(), await pool.connect(), await pool.connect()];
      try {
        // The interceptor has to sit on the prototype to see the workers' own connections
        await withQueryInterceptor(
          (sql) => {
            if (sql?.includes('UPDATE "Observation_References"')) {
              closing = true;
            }
            return undefined;
          },
          async () => {
            await expect(
              run(job, { concurrency: workers.length, clients: workers, rangeTargetRows: 1 })
            ).rejects.toThrow(DelayedError);
          }
        );

        // Only the driver delays the job, and only once every worker has settled. Workers doing it
        // themselves would throw with queries still in flight.
        expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
        expect(lastSavedData(job)).toMatchObject({ resumeFromResourceType: 'Observation' });
      } finally {
        for (const worker of workers) {
          worker.release(true);
        }
        isClosingSpy.mockRestore();
        await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = $1`, [obs.id]);
      }
    }));

  test('releases held-back workers when the queue closes', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();

      let closing = false;
      const isClosingSpy = vi.spyOn(queueRegistry, 'isClosing').mockImplementation(() => closing);
      const job = mockJob();

      const pool = getDatabasePool(DatabaseMode.WRITER);
      const workers = [await pool.connect(), await pool.connect(), await pool.connect()];
      try {
        await withQueryInterceptor(
          (sql) => {
            if (sql?.includes('UPDATE "Observation_References"')) {
              closing = true;
            }
            return undefined;
          },
          async () => {
            // Every range is slow, so the limit never grows to wake workers 1 and 2: only worker 0
            // leaving the loop can, and the job has to settle rather than hang
            await expect(
              run(job, { concurrency: workers.length, clients: workers, rangeTargetRows: 1, rangeTargetMs: 0 })
            ).rejects.toThrow(DelayedError);
          }
        );
        expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
      } finally {
        for (const worker of workers) {
          worker.release(true);
        }
        isClosingSpy.mockRestore();
        await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = $1`, [obs.id]);
      }
    }));

  test('does not revisit a table a previous attempt proved complete', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();
      const resumeData: ProjectIdBackfillJobData = { ...jobData, completedResourceTypes: ['Observation'] };

      const { statements, restore } = captureSql();
      try {
        await run(undefined, SINGLE_RANGE, resumeData);
      } finally {
        restore();
        await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = $1`, [obs.id]);
      }

      // Without the `projectId` index in place, re-proving a finished table costs a full scan of it
      expect(statements.some((sql) => sql.includes('UPDATE "Observation_References"'))).toBe(false);
    }));

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

  function lastSavedData(job: Job<CustomPostDeployMigrationJobData>): ProjectIdBackfillJobData {
    const calls = vi.mocked(job.updateData).mock.calls;
    return calls[calls.length - 1][0];
  }

  async function insertOrphan(resourceId: string): Promise<void> {
    await client.query(
      `INSERT INTO "Observation_References" ("resourceId", "targetId", "code") VALUES ($1, $2, 'subject')`,
      [resourceId, randomUUID()]
    );
  }

  test('skips ranges below the resume point when resuming a table mid-backfill', () =>
    withTestContext(async () => {
      // Work for the resumed attempt, placed above the resume point: everything below it is done
      const orphanId = 'f0000000-0000-4000-8000-000000000001';
      await insertOrphan(orphanId);
      const resumeData: ProjectIdBackfillJobData = {
        ...jobData,
        resumeFromResourceType: 'Observation',
        resumeFromResourceId: '40000000-0000-0000-0000-000000000000',
        resumeStep: 'backfill',
      };

      const { statements, restore } = captureSql();
      let results: MigrationActionResult[];
      try {
        results = await run(undefined, { rangeTargetRows: 1 }, resumeData);
      } finally {
        restore();
        await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = $1`, [orphanId]);
      }

      expect(observationResult(results)).toMatchObject({ passes: 1, orphansDeleted: 1 });
      // Ranges below the resume point were backfilled and swept by the previous attempt, so only
      // about three quarters of the key space is run again
      const ranges = observationResult(results)?.ranges as number;
      const updates = statements.filter((sql) => sql.includes('UPDATE "Observation_References"')).length;
      expect(updates).toBeLessThan(ranges);
      expect(updates).toBeGreaterThanOrEqual(Math.floor((ranges * 3) / 4));
    }));

  test('goes straight to verification when a previous attempt finished every range', () =>
    withTestContext(async () => {
      const orphanId = randomUUID();
      await insertOrphan(orphanId);
      const resumeData: ProjectIdBackfillJobData = {
        ...jobData,
        resumeFromResourceType: 'Observation',
        resumeStep: 'verify',
      };

      const { statements, restore } = captureSql();
      let results: MigrationActionResult[];
      try {
        results = await run(undefined, SINGLE_RANGE, resumeData);
      } finally {
        restore();
        await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = $1`, [orphanId]);
      }

      // Verification finds the orphan left behind, so a second, full pass still runs
      const firstCount = statements.findIndex((sql) => sql.includes('AS remaining'));
      const firstUpdate = statements.findIndex((sql) => sql.includes('UPDATE "Observation_References"'));
      expect(firstCount).toBeGreaterThanOrEqual(0);
      expect(firstUpdate).toBeGreaterThan(firstCount);
      expect(observationResult(results)).toMatchObject({ passes: 2, orphansDeleted: 1, remaining: 0 });
    }));

  test('saves progress as it goes, not only when the queue closes', () =>
    withTestContext(async () => {
      await createNulledObservation();
      const job = mockJob();

      // A process killed outright never reaches the closing path; BullMQ re-runs the stalled job
      // with whatever data was last saved
      await run(job, { rangeTargetRows: 1, progressIntervalMs: 0 });

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
      expect(lastSavedData(job)).toMatchObject({
        resumeFromResourceType: undefined,
        completedResourceTypes: expect.arrayContaining(['Observation']),
        rewrittenResourceTypes: expect.arrayContaining(['Observation']),
      });
      expect(job.moveToDelayed).not.toHaveBeenCalled();
    }));

  test('names the table in its saved progress before rewriting any of it', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();
      const job = mockJob();

      // A small table can finish every range inside one progress interval, so a process killed
      // before its final checkpoint would otherwise leave no record that the table was rewritten
      let savedBeforeRewrite: ProjectIdBackfillJobData | undefined;
      const restoreQuery = interceptBackfillUpdate(() => {
        savedBeforeRewrite = lastSavedData(job);
      });
      try {
        await run(job, { ...SINGLE_RANGE, progressIntervalMs: Number.MAX_SAFE_INTEGER });
      } finally {
        restoreQuery();
        await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = $1`, [obs.id]);
      }

      expect(savedBeforeRewrite).toMatchObject({ resumeFromResourceType: 'Observation' });
    }));

  const VACUUM_OBSERVATION = 'VACUUM (ANALYZE) "Observation_References"';
  const OBSERVATION_INDEX = 'Observation_Refs_projectId_code_targetId_idx';

  test('vacuums a table an earlier attempt rewrote before building its index', () =>
    withTestContext(async () => {
      const resumeData: ProjectIdBackfillJobData = {
        ...jobData,
        completedResourceTypes: ['Observation'],
        rewrittenResourceTypes: ['Observation'],
      };
      await client.query(`DROP INDEX IF EXISTS "${OBSERVATION_INDEX}"`);

      const { statements, restore } = captureSql();
      try {
        await run(undefined, SINGLE_RANGE, resumeData);
      } finally {
        restore();
      }

      // Skipping the table this attempt does not undo the bloat the previous one left behind
      expect(statements).toContain(VACUUM_OBSERVATION);
    }));

  test('vacuums the table an earlier attempt was partway through, even if it left no work', () =>
    withTestContext(async () => {
      const resumeData: ProjectIdBackfillJobData = {
        ...jobData,
        resumeFromResourceType: 'Observation',
        resumeStep: 'verify',
      };
      await client.query(`DROP INDEX IF EXISTS "${OBSERVATION_INDEX}"`);

      const { statements, restore } = captureSql();
      try {
        await run(undefined, SINGLE_RANGE, resumeData);
      } finally {
        restore();
      }

      expect(statements).toContain(VACUUM_OBSERVATION);
    }));

  test('does not vacuum again a rewritten table whose index an earlier attempt already built', () =>
    withTestContext(async () => {
      const resumeData: ProjectIdBackfillJobData = {
        ...jobData,
        completedResourceTypes: ['Observation'],
        rewrittenResourceTypes: ['Observation'],
      };
      // Built by the earlier attempt, right after it vacuumed the table
      await run(undefined, SINGLE_RANGE);

      const { statements, restore } = captureSql();
      try {
        await run(undefined, SINGLE_RANGE, resumeData);
      } finally {
        restore();
      }

      // Rewritten tables are never dropped from the list, so every resume of the index phase would
      // otherwise vacuum the largest tables again, after they were already finished
      expect(statements).not.toContain(VACUUM_OBSERVATION);
    }));

  function failBackfillWith(code: string): () => void {
    const originalQuery = client.query.bind(client);
    const spy = vi.spyOn(client, 'query').mockImplementation((async (...args: any[]) => {
      const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
      if (typeof sql === 'string' && sql.includes('UPDATE "Observation_References"')) {
        throw Object.assign(new Error('terminating connection due to administrator command'), { code });
      }
      return (originalQuery as any)(...args);
    }) as typeof client.query);
    return () => spy.mockRestore();
  }

  test('delays rather than fails the job when the database connection is lost', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();
      const job = mockJob();

      // A failover kills every connection; failing the job would discard all progress, since a
      // re-run starts from fresh job data
      const restore = failBackfillWith('57P01');
      try {
        await expect(run(job)).rejects.toThrow(DelayedError);
      } finally {
        restore();
        await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = $1`, [obs.id]);
      }

      expect(lastSavedData(job)).toMatchObject({ resumeFromResourceType: 'Observation', transientFailures: 1 });
      expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
    }));

  test('delays the job when the connection drops before a failed range can roll back', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();
      const job = mockJob();

      const originalQuery = client.query.bind(client);
      let deadlocked = false;
      let rollbackFailed = false;
      const spy = vi.spyOn(client, 'query').mockImplementation((async (...args: any[]) => {
        const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
        if (!deadlocked && typeof sql === 'string' && sql.includes('UPDATE "Observation_References"')) {
          deadlocked = true;
          throw Object.assign(new Error('deadlock detected'), { code: '40P01' });
        }
        if (deadlocked && !rollbackFailed && sql === 'ROLLBACK') {
          rollbackFailed = true;
          // Really end the transaction so the shared test connection stays usable
          await (originalQuery as any)('ROLLBACK');
          throw new Error('Connection terminated unexpectedly');
        }
        return (originalQuery as any)(...args);
      }) as typeof client.query);

      try {
        // The deadlock is what the statement failed with, but the lost connection is what matters
        await expect(run(job)).rejects.toThrow(DelayedError);
      } finally {
        spy.mockRestore();
        await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = $1`, [obs.id]);
      }
      expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
    }));

  test('fails the job once lost connections have exhausted their restarts', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();
      const job = mockJob();
      const data: ProjectIdBackfillJobData = { ...jobData, transientFailures: 5 };

      const restore = failBackfillWith('57P01');
      try {
        await expect(run(job, {}, data)).rejects.toThrow(/administrator command/);
      } finally {
        restore();
        await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = $1`, [obs.id]);
      }
      expect(job.moveToDelayed).not.toHaveBeenCalled();
    }));

  test('fails the job outright on errors other than a lost connection', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();
      const job = mockJob();

      const restore = failBackfillWith('42P01');
      try {
        await expect(run(job)).rejects.toThrow(/administrator command/);
      } finally {
        restore();
        await client.query(`DELETE FROM "Observation_References" WHERE "resourceId" = $1`, [obs.id]);
      }
      expect(job.moveToDelayed).not.toHaveBeenCalled();
    }));

  test('skips the backfill but still builds the index on tables with chained search disabled', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();
      const { repo, project } = await createTestProject({ withRepo: true });
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        managingOrganization: { reference: 'Organization/' + randomUUID() },
      });
      await client.query(`UPDATE "Patient_References" SET "projectId" = NULL WHERE "resourceId" = $1`, [patient.id]);

      // Rebuilt by the run below, so this proves the index phase still covers the table
      await client.query(`DROP INDEX IF EXISTS "Observation_Refs_projectId_code_targetId_idx"`);

      getConfig().disableChainedSearch = ['Observation'];
      const { statements, restore } = captureSql();
      let results: MigrationActionResult[];
      try {
        results = await run(undefined, SINGLE_RANGE);
      } finally {
        restore();
        getConfig().disableChainedSearch = undefined;
      }

      expect(results).toContainEqual(
        expect.objectContaining({
          name: 'Skip backfill of reference tables with chained search disabled',
          skipped: 'Observation',
        })
      );
      expect(observationResult(results)).toBeUndefined();
      expect(statements.filter((sql) => sql.includes('"Observation_References"'))).toEqual([
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Observation_Refs_projectId_code_targetId_idx" ON "Observation_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")`,
      ]);
      const skipped = await client.query(
        `SELECT 1 FROM "Observation_References" WHERE "resourceId" = $1 AND "projectId" IS NULL`,
        [obs.id]
      );
      expect(skipped.rowCount).toBeGreaterThan(0);

      const backfilled = await client.query<{ projectId: string | null }>(
        `SELECT "projectId" FROM "Patient_References" WHERE "resourceId" = $1`,
        [patient.id]
      );
      expect(backfilled.rows.length).toBeGreaterThan(0);
      expect(backfilled.rows.every((r) => r.projectId === project.id)).toBe(true);
    }));

  test('returns every worker connection it checked out', () =>
    withTestContext(async () => {
      await createNulledObservation();
      const pool = getDatabasePool(DatabaseMode.WRITER);
      const before = pool.totalCount;

      // No `clients` override, so the migration acquires and releases its own connections.
      // `connectionTimeoutMillis` is unset, so a leak would stall request handlers silently.
      await migrationFn(client, [], undefined, jobData, { concurrency: 2, ...SINGLE_RANGE });

      expect(pool.waitingCount).toBe(0);
      expect(pool.totalCount).toBeLessThanOrEqual(before);
    }));
});

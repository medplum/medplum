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
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { createTestProject, withTestContext } from '../../test.setup';
import { queueRegistry } from '../../workers/utils';
import type { MigrationActionResult } from '../types';
import type { CustomPostDeployMigrationJobData } from './types';
import { callback as migrationFn } from './v46';

describe('v45', () => {
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

  const jobData = { type: 'custom', asyncJobId: randomUUID() } as const;

  async function run(job?: Job<CustomPostDeployMigrationJobData>): Promise<MigrationActionResult[]> {
    const results: MigrationActionResult[] = [];
    await migrationFn(client, results, job, jobData);
    return results;
  }

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
      await createNulledObservation();

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
        results = await run();
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

  test('backfills a table before sweeping its orphans', () =>
    withTestContext(async () => {
      const obs = await createNulledObservation();
      const orphanId = randomUUID();
      await client.query(
        `INSERT INTO "Observation_References" ("resourceId", "targetId", "code") VALUES ($1, $2, 'subject')`,
        [orphanId, randomUUID()]
      );

      const { statements, restore } = captureSql();
      try {
        await run();
      } finally {
        restore();
      }

      // Backfilling first drains every NULL row whose resource still exists, so the sweep that
      // follows reads a NULL region holding only orphans instead of anti-joining the whole table
      const backfill = statements.findIndex((sql) => sql.includes('UPDATE "Observation_References"'));
      const sweep = statements.findIndex((sql) => sql.includes('DELETE FROM "Observation_References"'));
      expect(backfill).toBeGreaterThanOrEqual(0);
      expect(sweep).toBeGreaterThan(backfill);

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
});

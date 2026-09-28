// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import type { AsyncJob, Patient, Practitioner } from '@medplum/fhirtypes';
import type { Queue } from 'bullmq';
import { DelayedError, Job } from 'bullmq';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import type { MockInstance } from 'vitest';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { getShardSystemRepo } from '../../fhir/repo';
import { GLOBAL_SHARD_ID } from '../../fhir/sharding';
import { createTestProject, withTestContext } from '../../test.setup';
import { PostDeployMigrationQueueName, prepareCustomMigrationJobData } from '../../workers/post-deploy-migration';
import { queueRegistry } from '../../workers/utils';
import type { MigrationActionResult } from '../types';
import type { CustomPostDeployMigrationJobData } from './types';
import type { BackfillCheckpoint, BackfillOptions } from './v49';
import { backfillHumanNameProjectId, migration } from './v49';

async function runBackfill(options?: BackfillOptions): Promise<MigrationActionResult[]> {
  const client = await getDatabasePool(DatabaseMode.WRITER).connect();
  const results: MigrationActionResult[] = [];
  try {
    await backfillHumanNameProjectId(client, results, options);
  } finally {
    client.release();
  }
  return results;
}

async function clearProjectIds(...resourceIds: string[]): Promise<void> {
  await getDatabasePool(DatabaseMode.WRITER).query(
    'UPDATE "HumanName" SET "projectId" = NULL WHERE "resourceId" = ANY($1::uuid[])',
    [resourceIds]
  );
}

async function getProjectIds(resourceId: string): Promise<(string | null)[]> {
  const result = await getDatabasePool(DatabaseMode.WRITER).query<{ projectId: string | null }>(
    'SELECT "projectId" FROM "HumanName" WHERE "resourceId" = $1',
    [resourceId]
  );
  return result.rows.map((row) => row.projectId);
}

async function waitForLockWait(pid: number): Promise<void> {
  const pool = getDatabasePool(DatabaseMode.WRITER);
  for (let i = 0; i < 200; i++) {
    const result = await pool.query(
      `SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'`,
      [pid]
    );
    if (result.rowCount) {
      return;
    }
    await sleep(50);
  }
  throw new Error(`Backend ${pid} never waited on a lock`);
}

function isBatchQuery(text: unknown): boolean {
  return typeof text === 'string' && text.includes('WITH batch AS');
}

/**
 * Makes the next `times` batch statements raise a real serialization failure, aborting their transaction.
 * @param client - The client whose batch statements should fail.
 * @param times - How many batch statements to fail.
 * @returns The query spy.
 */
function failBatchQueries(client: PoolClient, times: number): MockInstance<PoolClient['query']> {
  const query = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
  let remaining = times;
  return vi.spyOn(client, 'query').mockImplementation(((...args: unknown[]) => {
    if (isBatchQuery(args[0]) && remaining-- > 0) {
      return query(
        `DO $$ BEGIN RAISE EXCEPTION 'could not serialize access due to concurrent delete' USING ERRCODE = 'serialization_failure'; END $$`
      );
    }
    return query(...args);
  }));
}

describe('v49: backfill HumanName.projectId', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Sets missing and stale projectId from the resource table', () =>
    withTestContext(async () => {
      const { project, repo } = await createTestProject({ withRepo: true });
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [
          { given: ['Alice'], family: randomUUID() },
          { given: ['Ali'], family: randomUUID() },
        ],
      });
      const practitioner = await repo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        name: [{ given: ['Bob'], family: randomUUID() }],
      });

      const pool = getDatabasePool(DatabaseMode.WRITER);
      await pool.query('UPDATE "HumanName" SET "projectId" = NULL WHERE "resourceId" = $1', [patient.id]);
      await pool.query('UPDATE "HumanName" SET "projectId" = $1 WHERE "resourceId" = $2', [
        randomUUID(),
        practitioner.id,
      ]);

      // Small batch size forces multiple pages over each resource table
      await runBackfill({ batchSize: 500, delayBetweenBatches: 0 });

      const rows = await pool.query<{ resourceId: string; projectId: string }>(
        'SELECT "resourceId", "projectId" FROM "HumanName" WHERE "resourceId" = ANY($1::uuid[])',
        [[patient.id, practitioner.id]]
      );
      expect(rows.rows).toHaveLength(3);
      for (const row of rows.rows) {
        expect(row.projectId).toStrictEqual(project.id);
      }

      // Every row is now correct, so a rerun (e.g. after a failed job restarts from scratch) rewrites nothing
      const rerun = await runBackfill({ delayBetweenBatches: 0 });
      expect(rerun.every((r) => r.updated === 0)).toBe(true);
    }));

  test('Resuming from the last checkpoint after an interruption backfills every row', () =>
    withTestContext(async () => {
      const { project, repo } = await createTestProject({ withRepo: true });
      const patientIds: string[] = [];
      for (let i = 0; i < 20; i++) {
        const patient = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: randomUUID() }] });
        patientIds.push(patient.id);
      }
      patientIds.sort();
      const practitioner = await repo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        name: [{ family: randomUUID() }],
      });
      await clearProjectIds(...patientIds, practitioner.id);

      // Interrupt partway through Patient, as a shutdown would
      const midpoint = patientIds[9];
      const interruption = new Error('Interrupted');
      const checkpoints: BackfillCheckpoint[] = [];
      await expect(
        runBackfill({
          batchSize: 500,
          delayBetweenBatches: 0,
          onCheckpoint: async (checkpoint) => {
            checkpoints.push(checkpoint);
            if ('lastId' in checkpoint && checkpoint.resourceType === 'Patient' && checkpoint.lastId >= midpoint) {
              throw interruption;
            }
          },
        })
      ).rejects.toBe(interruption);

      const checkpoint = checkpoints.at(-1) as { resourceType: 'Patient'; lastId: string };
      const remaining = patientIds.filter((id) => id > checkpoint.lastId);
      expect(remaining.length).toBeGreaterThan(0);
      // A checkpoint is only reported once its batch has committed
      for (const id of patientIds.filter((id) => id <= checkpoint.lastId)) {
        expect(await getProjectIds(id)).toStrictEqual([project.id]);
      }

      await runBackfill({ checkpoint, delayBetweenBatches: 0 });
      for (const id of [...patientIds, practitioner.id]) {
        expect(await getProjectIds(id)).toStrictEqual([project.id]);
      }
    }));

  test('Skips rows deleted by a concurrent transaction instead of failing', () =>
    withTestContext(async () => {
      const { project, repo } = await createTestProject({ withRepo: true });
      const deleted = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: randomUUID() }] });
      const other = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: randomUUID() }] });
      await clearProjectIds(deleted.id, other.id);

      const pool = getDatabasePool(DatabaseMode.WRITER);
      const writer = await pool.connect();
      const client = await pool.connect();
      let backfill: Promise<void> | undefined;
      try {
        // Rewriting a resource's lookup rows mid-batch makes a REPEATABLE READ update fail with a serialization error
        await writer.query('BEGIN');
        await writer.query('DELETE FROM "HumanName" WHERE "resourceId" = $1', [deleted.id]);

        const pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        backfill = backfillHumanNameProjectId(client, [], { delayBetweenBatches: 0 });
        await waitForLockWait(pid);
        await writer.query('COMMIT');
        await backfill;
      } finally {
        await writer.query('ROLLBACK');
        writer.release();
        await backfill?.catch(() => undefined);
        client.release();
      }

      expect(await getProjectIds(deleted.id)).toStrictEqual([]);
      expect(await getProjectIds(other.id)).toStrictEqual([project.id]);
    }));

  test('Retries a batch once after a serialization failure', () =>
    withTestContext(async () => {
      const { project, repo } = await createTestProject({ withRepo: true });
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: randomUUID() }] });
      await clearProjectIds(patient.id);

      const client = await getDatabasePool(DatabaseMode.WRITER).connect();
      const querySpy = failBatchQueries(client, 1);
      try {
        await backfillHumanNameProjectId(client, [], { delayBetweenBatches: 0 });
      } finally {
        querySpy.mockRestore();
        client.release();
      }

      expect(await getProjectIds(patient.id)).toStrictEqual([project.id]);
    }));

  test('Fails after a second consecutive serialization failure', () =>
    withTestContext(async () => {
      const client = await getDatabasePool(DatabaseMode.WRITER).connect();
      const querySpy = failBatchQueries(client, 2);
      try {
        await expect(backfillHumanNameProjectId(client, [], { delayBetweenBatches: 0 })).rejects.toMatchObject({
          code: '40001',
        });
        // The failed transaction was rolled back, so the connection is still usable
        querySpy.mockRestore();
        await expect(client.query('SELECT 1')).resolves.toBeDefined();
      } finally {
        querySpy.mockRestore();
        client.release();
      }
    }));

  test('Saves the checkpoint to job data and yields when the queue is closing', async () => {
    const systemRepo = getShardSystemRepo(GLOBAL_SHARD_ID);
    const asyncJob = await systemRepo.createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'accepted',
      dataVersion: 49,
      requestTime: new Date().toISOString(),
      request: 'data-migration-v49',
    });

    let job = {} as Job<CustomPostDeployMigrationJobData>;
    await withTestContext(async () => {
      // Resume at the last resource type, past every id, so the backfill finishes in one empty batch
      const jobData = {
        ...prepareCustomMigrationJobData(asyncJob),
        humanNameBackfill: { resourceType: 'RelatedPerson', lastId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
      };
      job = new Job({} as Queue, 'PostDeployMigrationJobData', jobData);
      // The Job class is mocked, so its fields have to be set by hand
      job.data = jobData;
      job.token = 'some-token';
      Object.assign(job, { queueName: PostDeployMigrationQueueName });
    });

    const isClosingSpy = vi.spyOn(queueRegistry, 'isClosing').mockReturnValue(true);
    try {
      await expect(migration.run(systemRepo, job, job.data)).rejects.toBeInstanceOf(DelayedError);
    } finally {
      isClosingSpy.mockRestore();
    }

    expect(job.updateData).toHaveBeenCalledWith({ ...job.data, humanNameBackfill: { done: true } });

    // Yielding re-queues the job rather than failing it
    const updatedAsyncJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
    expect(updatedAsyncJob.status).toBe('accepted');
  });
});

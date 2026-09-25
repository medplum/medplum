// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Patient, Practitioner } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { globalLogger } from '../../logger';
import { createTestProject, withTestContext } from '../../test.setup';
import type { MigrationActionResult } from '../types';
import { backfillHumanNameProjectId } from './v49';

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

      const client = await pool.connect();
      const results: MigrationActionResult[] = [];
      try {
        // Small batch size forces multiple pages over each resource table
        await backfillHumanNameProjectId(client, results, { batchSize: 500 });
      } finally {
        client.release();
      }

      const rows = await pool.query<{ resourceId: string; projectId: string }>(
        'SELECT "resourceId", "projectId" FROM "HumanName" WHERE "resourceId" = ANY($1::uuid[])',
        [[patient.id, practitioner.id]]
      );
      expect(rows.rows).toHaveLength(3);
      for (const row of rows.rows) {
        expect(row.projectId).toStrictEqual(project.id);
      }

      expect(results.map((r) => r.name)).toStrictEqual([
        'Backfill HumanName.projectId from Patient',
        'Backfill HumanName.projectId from Person',
        'Backfill HumanName.projectId from Practitioner',
        'Backfill HumanName.projectId from RelatedPerson',
      ]);
      expect(results[0].updated).toBeGreaterThanOrEqual(2);
      expect(results[2].updated).toBeGreaterThanOrEqual(1);
    }));

  test('Is a no-op when every row is already correct', () =>
    withTestContext(async () => {
      const pool = getDatabasePool(DatabaseMode.WRITER);
      const client = await pool.connect();
      const results: MigrationActionResult[] = [];
      try {
        await backfillHumanNameProjectId(client, results);
        results.length = 0;
        await backfillHumanNameProjectId(client, results);
      } finally {
        client.release();
      }
      expect(results.every((r) => r.updated === 0)).toBe(true);
    }));

  test('Paces batches and logs progress', () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({ withRepo: true });
      for (let i = 0; i < 3; i++) {
        await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: randomUUID() }] });
      }

      // Size batches off the shared test DB so Patient always spans several batches without scanning row by row
      const pool = getDatabasePool(DatabaseMode.WRITER);
      const countResult = await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM "Patient"');
      const batchSize = Math.max(1, Math.floor(countResult.rows[0].count / 3));

      // Distinctive delay so these sleeps can be told apart from other timers
      const delayBetweenBatches = 3;
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      const infoSpy = vi.spyOn(globalLogger, 'info').mockImplementation(() => undefined);

      const client = await pool.connect();
      const results: MigrationActionResult[] = [];
      try {
        await backfillHumanNameProjectId(client, results, {
          batchSize,
          delayBetweenBatches,
          progressLogThreshold: batchSize,
        });
      } finally {
        client.release();
      }

      const sleeps = setTimeoutSpy.mock.calls.filter(([, ms]) => ms === delayBetweenBatches);
      const logData = (msg: string): Record<string, unknown>[] =>
        infoSpy.mock.calls.filter(([m]) => m === msg).map(([, data]) => data as Record<string, unknown>);
      const progressLogs = logData('HumanName.projectId backfill in progress');
      const completedLogs = logData('HumanName.projectId backfill completed');
      setTimeoutSpy.mockRestore();
      infoSpy.mockRestore();

      // Every full batch is followed by a pause; the final partial (or empty) batch is not
      const fullBatches = results.reduce((sum, r) => sum + Math.floor((r.scanned as number) / batchSize), 0);
      expect(fullBatches).toBeGreaterThanOrEqual(3);
      expect(sleeps).toHaveLength(fullBatches);

      const patientResult = results.find((r) => r.name === 'Backfill HumanName.projectId from Patient');
      // Logged once per threshold crossed, so a trailing partial batch doesn't log
      const patientProgress = progressLogs.filter((data) => data.resourceType === 'Patient');
      expect(patientProgress).toHaveLength(Math.floor((patientResult?.scanned as number) / batchSize));
      expect(patientProgress.at(-1)).toMatchObject({
        resourceType: 'Patient',
        lastId: expect.any(String),
        durationMs: expect.any(Number),
      });

      expect(completedLogs.map((data) => data.resourceType)).toStrictEqual([
        'Patient',
        'Person',
        'Practitioner',
        'RelatedPerson',
      ]);
    }));
});

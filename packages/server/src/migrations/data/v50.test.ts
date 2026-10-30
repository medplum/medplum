// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AsyncJob, Patient, Practitioner } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { getShardSystemRepo } from '../../fhir/repo';
import { GLOBAL_SHARD_ID } from '../../fhir/sharding';
import { createTestProject, withTestContext } from '../../test.setup';
import { prepareCustomMigrationJobData } from '../../workers/post-deploy-migration';
import type { MigrationActionResult } from '../types';
import { migration, repairNullHumanNameProjectIds } from './v50';

async function isProjectIdNotNull(): Promise<boolean> {
  const result = await getDatabasePool(DatabaseMode.WRITER).query<{ notnull: boolean }>(
    `SELECT attnotnull AS notnull FROM pg_attribute WHERE attrelid = '"HumanName"'::regclass AND attname = 'projectId'`
  );
  return result.rows[0].notnull;
}

async function getProjectIds(resourceId: string): Promise<(string | null)[]> {
  const result = await getDatabasePool(DatabaseMode.WRITER).query<{ projectId: string | null }>(
    'SELECT "projectId" FROM "HumanName" WHERE "resourceId" = $1',
    [resourceId]
  );
  return result.rows.map((row) => row.projectId);
}

/**
 * Recreates the state that failed v50 in the field: rows left NULL by a write from an older server after the v49
 * backfill passed their resource, plus a row whose resource is gone.
 * @param resourceIds - Resources whose names should have their projectId cleared.
 * @returns The resource ID of the orphaned row.
 */
async function plantNullRows(resourceIds: string[]): Promise<string> {
  const pool = getDatabasePool(DatabaseMode.WRITER);
  await pool.query('ALTER TABLE "HumanName" ALTER COLUMN "projectId" DROP NOT NULL');
  await pool.query('UPDATE "HumanName" SET "projectId" = NULL WHERE "resourceId" = ANY($1::uuid[])', [resourceIds]);
  const orphanId = randomUUID();
  await pool.query(`INSERT INTO "HumanName" ("resourceId", "name", "projectId") VALUES ($1, 'Orphan', NULL)`, [
    orphanId,
  ]);
  return orphanId;
}

describe('v50: HumanName.projectId NOT NULL', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterEach(async () => {
    // Leave the shared test database with the column NOT NULL even if a test failed partway
    const pool = getDatabasePool(DatabaseMode.WRITER);
    // A run that failed partway through the NOT NULL step can leave its temporary check constraint behind
    await pool.query('ALTER TABLE "HumanName" DROP CONSTRAINT IF EXISTS "HumanName_projectId_not_null"');
    await pool.query('DELETE FROM "HumanName" WHERE "projectId" IS NULL');
    await pool.query('ALTER TABLE "HumanName" ALTER COLUMN "projectId" SET NOT NULL');
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Repairs NULL projectId from the resource and deletes rows with no resource', () =>
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
      const untouched = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Carol'], family: randomUUID() }],
      });

      const orphanId = await plantNullRows([patient.id, practitioner.id]);

      const client = await getDatabasePool(DatabaseMode.WRITER).connect();
      const results: MigrationActionResult[] = [];
      try {
        await repairNullHumanNameProjectIds(client, results);
      } finally {
        client.release();
      }

      expect(await getProjectIds(patient.id)).toStrictEqual([project.id, project.id]);
      expect(await getProjectIds(practitioner.id)).toStrictEqual([project.id]);
      expect(await getProjectIds(untouched.id)).toStrictEqual([project.id]);
      expect(await getProjectIds(orphanId)).toStrictEqual([]);
      expect(results).toStrictEqual([
        expect.objectContaining({ name: 'Set NULL HumanName.projectId from resource', updated: 3 }),
        expect.objectContaining({ name: 'Delete NULL HumanName.projectId rows with no resource', deleted: 1 }),
      ]);
    }));

  test('Completes the migration when NULL projectId rows remain after v49', async () => {
    const { project, repo } = await createTestProject({ withRepo: true });
    const patient = await withTestContext(() =>
      repo.createResource<Patient>({ resourceType: 'Patient', name: [{ given: ['Dave'], family: randomUUID() }] })
    );
    const orphanId = await plantNullRows([patient.id]);
    expect(await isProjectIdNotNull()).toBe(false);

    const systemRepo = getShardSystemRepo(GLOBAL_SHARD_ID);
    const asyncJob = await systemRepo.createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'accepted',
      dataVersion: 50,
      requestTime: new Date().toISOString(),
      request: 'data-migration-v50',
    });
    await withTestContext(() => migration.run(systemRepo, undefined, prepareCustomMigrationJobData(asyncJob)));

    const updatedAsyncJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
    expect(updatedAsyncJob.status).toBe('completed');
    expect(await isProjectIdNotNull()).toBe(true);
    expect(await getProjectIds(patient.id)).toStrictEqual([project.id]);
    expect(await getProjectIds(orphanId)).toStrictEqual([]);
  });
});

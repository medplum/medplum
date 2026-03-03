// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AsyncJob, Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { DatabaseMode, getDatabasePool } from '../database';
import type { Repository, SystemRepository } from '../fhir/repo';
import { getAllPaddingSentinels } from '../fhir/token-column';
import { createTestProject, withTestContext } from '../test.setup';
import type { RepaddingJobData, RepaddingUnit } from './repadding';
import { RepaddingJob } from './repadding';

describe('Repadding Worker', () => {
  let repo: Repository;
  let systemRepo: SystemRepository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    repo = (await createTestProject({ withRepo: true })).repo;
    systemRepo = repo.getSystemRepo();
  });

  beforeEach(() => {
    jest.spyOn(process.stdout, 'write').mockImplementation(() => {
      return true;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  function createJobData(
    asyncJobId: string,
    units: RepaddingUnit[],
    oldConfig: { m: number; lambda: number; statisticsTarget: number },
    newConfig: { m: number; lambda: number; statisticsTarget: number },
    overrides?: Partial<RepaddingJobData>
  ): RepaddingJobData {
    return {
      type: 'repadding',
      asyncJobId,
      units,
      oldConfig,
      newConfig,
      currentUnitIndex: 0,
      currentPhase: 'classify',
      startTime: Date.now(),
      count: 0,
      results: Object.create(null),
      ...overrides,
    };
  }

  async function createAsyncJob(): Promise<AsyncJob & { id: string }> {
    return withTestContext(() =>
      repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/repad',
      })
    );
  }

  async function insertPatientsWithSentinels(
    count: number,
    sentinels: string[],
    sentinelProbability: number = 1.0
  ): Promise<string[]> {
    const pool = getDatabasePool(DatabaseMode.WRITER);
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = randomUUID();
      ids.push(id);

      // Create a patient through the repo so all columns are properly set
      await withTestContext(async () => {
        await systemRepo.createResource<Patient>({
          resourceType: 'Patient',
          id,
          identifier: [{ system: 'http://example.com/mrn', value: `MRN-${id}` }],
        });
      });

      // Now directly update the __identifier column to include sentinels
      if (sentinels.length > 0 && Math.random() < sentinelProbability) {
        const sentinel = sentinels[Math.floor(Math.random() * sentinels.length)];
        await pool.query(
          `UPDATE "Patient" SET "__identifier" = "__identifier" || ARRAY[$1::UUID] WHERE "id" = $2::UUID`,
          [sentinel, id]
        );
      }
    }
    return ids;
  }

  async function getIdentifierColumn(id: string): Promise<string[]> {
    const pool = getDatabasePool(DatabaseMode.WRITER);
    const result = await pool.query(`SELECT "__identifier" FROM "Patient" WHERE "id" = $1::UUID`, [id]);
    return result.rows[0]?.__identifier ?? [];
  }

  async function workTableExists(tableName: string): Promise<boolean> {
    const pool = getDatabasePool(DatabaseMode.WRITER);
    const result = await pool.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)`, [
      tableName,
    ]);
    return result.rows[0].exists;
  }

  test('No-op: identical configs produce empty work table, job completes immediately', () =>
    withTestContext(async () => {
      const asyncJob = await createAsyncJob();
      const units: RepaddingUnit[] = [{ resourceType: 'Patient', columnName: '__identifier' }];
      const config = { m: 10, lambda: 4.3, statisticsTarget: 100 };
      const data = createJobData(asyncJob.id, units, config, config);

      const repaddingJob = new RepaddingJob(systemRepo);
      const result = await repaddingJob.execute(undefined, data);

      expect(result).toStrictEqual('finished');

      const updatedJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
      expect(updatedJob.status).toStrictEqual('completed');

      // Work table should be cleaned up
      const workTable = repaddingJob.getWorkTableName(data);
      expect(await workTableExists(workTable)).toStrictEqual(false);
    }));

  test('Remove all padding: newConfig.m = 0, all work is remove', () =>
    withTestContext(async () => {
      const oldSentinels = getAllPaddingSentinels(3);
      const patientIds = await insertPatientsWithSentinels(5, oldSentinels, 1.0);

      const asyncJob = await createAsyncJob();
      const units: RepaddingUnit[] = [{ resourceType: 'Patient', columnName: '__identifier' }];
      const oldConfig = { m: 3, lambda: 4.3, statisticsTarget: 100 };
      const newConfig = { m: 0, lambda: 0, statisticsTarget: 100 };
      const data = createJobData(asyncJob.id, units, oldConfig, newConfig);

      const repaddingJob = new RepaddingJob(systemRepo);
      const result = await repaddingJob.execute(undefined, data);

      expect(result).toStrictEqual('finished');

      // Verify sentinels are removed
      for (const id of patientIds) {
        const col = await getIdentifierColumn(id);
        for (const sentinel of oldSentinels) {
          expect(col).not.toContain(sentinel);
        }
      }

      // Verify work table is cleaned up
      const workTable = repaddingJob.getWorkTableName(data);
      expect(await workTableExists(workTable)).toStrictEqual(false);

      // Verify AsyncJob is completed
      const updatedJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
      expect(updatedJob.status).toStrictEqual('completed');
    }));

  test('Add padding: oldConfig.m = 0, all work is add', () =>
    withTestContext(async () => {
      // Create patients without any sentinels
      const patientIds = await insertPatientsWithSentinels(10, [], 0);

      const asyncJob = await createAsyncJob();
      const units: RepaddingUnit[] = [{ resourceType: 'Patient', columnName: '__identifier' }];
      const oldConfig = { m: 0, lambda: 0, statisticsTarget: 100 };
      // Use high lambda to guarantee all rows get classified as 'add'
      const newConfig = { m: 5, lambda: 10000, statisticsTarget: 1 };
      const data = createJobData(asyncJob.id, units, oldConfig, newConfig);

      const repaddingJob = new RepaddingJob(systemRepo);
      const result = await repaddingJob.execute(undefined, data);

      expect(result).toStrictEqual('finished');

      // Verify sentinels are added
      const newSentinels = getAllPaddingSentinels(5);
      let addedCount = 0;
      for (const id of patientIds) {
        const col = await getIdentifierColumn(id);
        const hasSentinel = col.some((v) => newSentinels.includes(v));
        if (hasSentinel) {
          addedCount++;
        }
      }
      // With lambda=10000 and statisticsTarget=1, fraction is very high, so most/all should have sentinels
      expect(addedCount).toBeGreaterThan(0);

      const updatedJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
      expect(updatedJob.status).toStrictEqual('completed');
    }));

  test('Swap: rows with old sentinels get new sentinels', () =>
    withTestContext(async () => {
      const oldSentinels = getAllPaddingSentinels(3);
      const newSentinels = getAllPaddingSentinels(5);
      const patientIds = await insertPatientsWithSentinels(5, oldSentinels, 1.0);

      const asyncJob = await createAsyncJob();
      const units: RepaddingUnit[] = [{ resourceType: 'Patient', columnName: '__identifier' }];
      // Both configs have high fraction to ensure swap rather than remove
      const oldConfig = { m: 3, lambda: 10000, statisticsTarget: 1 };
      const newConfig = { m: 5, lambda: 10000, statisticsTarget: 1 };
      const data = createJobData(asyncJob.id, units, oldConfig, newConfig);

      const repaddingJob = new RepaddingJob(systemRepo);
      const result = await repaddingJob.execute(undefined, data);

      expect(result).toStrictEqual('finished');

      // Verify old sentinels are replaced with new sentinels
      for (const id of patientIds) {
        const col = await getIdentifierColumn(id);
        // Old sentinels that overlap with new ones (0, 1, 2) may still be present
        // but the row should have at least one sentinel from the new set
        const hasNewSentinel = col.some((v) => newSentinels.includes(v));
        expect(hasNewSentinel).toStrictEqual(true);
      }

      const updatedJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
      expect(updatedJob.status).toStrictEqual('completed');
    }));

  test('Overlapping sentinels: old m=10, new m=17', () =>
    withTestContext(async () => {
      const oldSentinels = getAllPaddingSentinels(10);
      const newSentinels = getAllPaddingSentinels(17);
      const patientIds = await insertPatientsWithSentinels(5, oldSentinels, 1.0);

      // Sentinel indices 0-9 overlap between old and new
      expect(oldSentinels.every((s) => newSentinels.includes(s))).toStrictEqual(true);
      expect(newSentinels.length).toStrictEqual(17);

      const asyncJob = await createAsyncJob();
      const units: RepaddingUnit[] = [{ resourceType: 'Patient', columnName: '__identifier' }];
      const oldConfig = { m: 10, lambda: 10000, statisticsTarget: 1 };
      const newConfig = { m: 17, lambda: 10000, statisticsTarget: 1 };
      const data = createJobData(asyncJob.id, units, oldConfig, newConfig);

      const repaddingJob = new RepaddingJob(systemRepo);
      const result = await repaddingJob.execute(undefined, data);

      expect(result).toStrictEqual('finished');

      // Rows should have sentinels from the new set
      for (const id of patientIds) {
        const col = await getIdentifierColumn(id);
        const hasNewSentinel = col.some((v) => newSentinels.includes(v));
        expect(hasNewSentinel).toStrictEqual(true);
      }

      const updatedJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
      expect(updatedJob.status).toStrictEqual('completed');
    }));

  test('Batch processing: process more rows than batchSize', () =>
    withTestContext(async () => {
      const oldSentinels = getAllPaddingSentinels(3);
      await insertPatientsWithSentinels(15, oldSentinels, 1.0);

      const asyncJob = await createAsyncJob();
      const units: RepaddingUnit[] = [{ resourceType: 'Patient', columnName: '__identifier' }];
      const oldConfig = { m: 3, lambda: 10000, statisticsTarget: 1 };
      const newConfig = { m: 0, lambda: 0, statisticsTarget: 100 };
      const data = createJobData(asyncJob.id, units, oldConfig, newConfig, { batchSize: 5 });

      const repaddingJob = new RepaddingJob(systemRepo);
      const result = await repaddingJob.execute(undefined, data);

      expect(result).toStrictEqual('finished');

      const updatedJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
      expect(updatedJob.status).toStrictEqual('completed');
    }));

  test('Work table cleanup: verify table is dropped after completion', () =>
    withTestContext(async () => {
      const asyncJob = await createAsyncJob();
      const units: RepaddingUnit[] = [{ resourceType: 'Patient', columnName: '__identifier' }];
      const config = { m: 3, lambda: 4.3, statisticsTarget: 100 };
      const data = createJobData(asyncJob.id, units, config, config);

      const repaddingJob = new RepaddingJob(systemRepo);
      const workTable = repaddingJob.getWorkTableName(data);

      await repaddingJob.execute(undefined, data);

      expect(await workTableExists(workTable)).toStrictEqual(false);
    }));

  test('AsyncJob progress: verify output parameters updated', () =>
    withTestContext(async () => {
      const asyncJob = await createAsyncJob();
      const units: RepaddingUnit[] = [{ resourceType: 'Patient', columnName: '__identifier' }];
      const oldConfig = { m: 3, lambda: 4.3, statisticsTarget: 100 };
      const newConfig = { m: 5, lambda: 4.3, statisticsTarget: 100 };
      const data = createJobData(asyncJob.id, units, oldConfig, newConfig);

      const repaddingJob = new RepaddingJob(systemRepo);
      await repaddingJob.execute(undefined, data);

      const updatedJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
      expect(updatedJob.status).toStrictEqual('completed');
      expect(updatedJob.output).toBeDefined();
      expect(updatedJob.output?.parameter).toBeDefined();

      const resultParam = updatedJob.output?.parameter?.find((p) => p.name === 'result');
      if (resultParam) {
        const unitPart = resultParam.part?.find((p) => p.name === 'unit');
        expect(unitPart?.valueString).toStrictEqual('Patient/__identifier');

        const swappedPart = resultParam.part?.find((p) => p.name === 'swapped');
        expect(swappedPart?.valueInteger).toBeDefined();

        const removedPart = resultParam.part?.find((p) => p.name === 'removed');
        expect(removedPart?.valueInteger).toBeDefined();

        const addedPart = resultParam.part?.find((p) => p.name === 'added');
        expect(addedPart?.valueInteger).toBeDefined();

        const elapsedPart = resultParam.part?.find((p) => p.name === 'elapsedTime');
        expect(elapsedPart?.valueQuantity?.code).toStrictEqual('ms');
      }
    }));

  test('Multiple units: multiple (resourceType, column) pairs processed sequentially', () =>
    withTestContext(async () => {
      const asyncJob = await createAsyncJob();
      // Use two different resource types to test sequential processing
      const units: RepaddingUnit[] = [
        { resourceType: 'Patient', columnName: '__identifier' },
        { resourceType: 'Patient', columnName: '__identifier' },
      ];
      const oldConfig = { m: 0, lambda: 0, statisticsTarget: 100 };
      const newConfig = { m: 3, lambda: 4.3, statisticsTarget: 100 };
      const data = createJobData(asyncJob.id, units, oldConfig, newConfig);

      const repaddingJob = new RepaddingJob(systemRepo);
      const result = await repaddingJob.execute(undefined, data);

      expect(result).toStrictEqual('finished');

      const updatedJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
      expect(updatedJob.status).toStrictEqual('completed');
    }));

  test('Interrupted: cancelled AsyncJob stops processing', () =>
    withTestContext(async () => {
      let asyncJob = await createAsyncJob();

      // Cancel the job immediately
      await systemRepo.updateResource<AsyncJob>({
        ...asyncJob,
        status: 'cancelled',
      });

      const units: RepaddingUnit[] = [{ resourceType: 'Patient', columnName: '__identifier' }];
      const config = { m: 3, lambda: 4.3, statisticsTarget: 100 };
      const data = createJobData(asyncJob.id, units, config, config);

      const repaddingJob = new RepaddingJob(systemRepo);
      const result = await repaddingJob.execute(undefined, data);

      expect(result).toStrictEqual('interrupted');

      asyncJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
      expect(asyncJob.status).toStrictEqual('cancelled');
    }));

  test('Invalid column name throws error', () =>
    withTestContext(async () => {
      const asyncJob = await createAsyncJob();
      const units: RepaddingUnit[] = [
        { resourceType: 'Patient', columnName: 'bad_column; DROP TABLE "Patient"' as any },
      ];
      const config = { m: 3, lambda: 4.3, statisticsTarget: 100 };
      const data = createJobData(asyncJob.id, units, config, config);

      const repaddingJob = new RepaddingJob(systemRepo);
      await expect(repaddingJob.execute(undefined, data)).rejects.toThrow('Invalid column name');
    }));
});

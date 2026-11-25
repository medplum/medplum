// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { stringify } from '@medplum/core';
import type { Patient, Project, Reference } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { initAppServices, shutdownApp } from '../../app';
import { getConfig, loadTestConfig } from '../../config/loader';
import { getCacheRedis } from '../../redis';
import { withTestContext } from '../../test.setup';
import type { SystemRepository } from '../repo';
import { getShardSystemRepo } from '../repo';
import { GLOBAL_SHARD_ID } from '../sharding';
import {
  buildResourceCacheDelete,
  buildResourceCacheSet,
  getResourceCacheEntries,
  getResourceCacheEntry,
  getResourceCacheKey,
  writeResourceCache,
} from './resource-cache';

describe('Repository resource cache', () => {
  const shardId = GLOBAL_SHARD_ID;
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Returns resource cache key', () => {
    expect(getResourceCacheKey('Patient', 'ABC123')).toStrictEqual('Patient/abc123');
  });

  test('Sets, reads, and deletes resource cache entry', async () => {
    const patient = buildPatient();

    try {
      await writeResourceCache([buildResourceCacheSet(patient, shardId)]);

      const cacheEntry = await getResourceCacheEntry<Patient>('Patient', patient.id.toUpperCase());
      expect(cacheEntry).toStrictEqual({
        resource: patient,
        projectId: patient.meta?.project,
        shardId: shardId,
      });
    } finally {
      await writeResourceCache([buildResourceCacheDelete('Patient', [patient.id])]);
    }

    await expect(getResourceCacheEntry<Patient>('Patient', patient.id)).resolves.toBeUndefined();
  });

  test('Bulk reads preserve reference order', async () => {
    const patient1 = buildPatient();
    const patient2 = buildPatient();
    const missingId = randomUUID();

    try {
      await writeResourceCache([buildResourceCacheSet(patient1, shardId)]);
      await writeResourceCache([buildResourceCacheSet(patient2, shardId)]);

      const references: Reference[] = [
        { reference: `Patient/${patient1.id}` },
        {},
        { reference: `Patient/${missingId}` },
        { reference: `Patient/${patient2.id}` },
      ];

      const cacheEntries = await getResourceCacheEntries(references);
      expect(cacheEntries).toStrictEqual([
        { resource: patient1, projectId: patient1.meta?.project, shardId },
        undefined,
        undefined,
        { resource: patient2, projectId: patient2.meta?.project, shardId },
      ]);
    } finally {
      await writeResourceCache([buildResourceCacheDelete('Patient', [patient1.id, patient2.id, missingId])]);
    }
  });

  test('Deletes resource cache entries', async () => {
    const patient1 = buildPatient();
    const patient2 = buildPatient();

    await writeResourceCache([buildResourceCacheSet(patient1, shardId)]);
    await writeResourceCache([buildResourceCacheSet(patient2, shardId)]);

    await writeResourceCache([buildResourceCacheDelete('Patient', [patient1.id, patient2.id])]);

    await expect(getResourceCacheEntry<Patient>('Patient', patient1.id)).resolves.toBeUndefined();
    await expect(getResourceCacheEntry<Patient>('Patient', patient2.id)).resolves.toBeUndefined();
  });

  test('Applies a batch of writes in order', async () => {
    const patient = buildPatient();
    const set = buildResourceCacheSet(patient, shardId, { force: true });
    const del = buildResourceCacheDelete('Patient', [patient.id]);

    try {
      await writeResourceCache([set, del]);
      await expect(getResourceCacheEntry<Patient>('Patient', patient.id)).resolves.toBeUndefined();

      await writeResourceCache([del, set]);
      await expect(getResourceCacheEntry<Patient>('Patient', patient.id)).resolves.toMatchObject({ resource: patient });
    } finally {
      await writeResourceCache([buildResourceCacheDelete('Patient', [patient.id])]);
    }
  });

  describe('cacheResourcesOnWrite disabled', () => {
    let prevCacheResourcesOnWrite: boolean | undefined;

    beforeEach(() => {
      prevCacheResourcesOnWrite = getConfig().cacheResourcesOnWrite;
      getConfig().cacheResourcesOnWrite = false;
    });

    afterEach(() => {
      getConfig().cacheResourcesOnWrite = prevCacheResourcesOnWrite;
    });

    test('Does not create missing cache entry', async () => {
      const patient = buildPatient();

      await writeResourceCache([buildResourceCacheSet(patient, shardId)]);

      await expect(getResourceCacheEntry<Patient>('Patient', patient.id)).resolves.toBeUndefined();
    });

    test('Updates existing cache entry', async () => {
      const patient = buildPatient();

      try {
        await writeResourceCache([buildResourceCacheSet(patient, shardId, { force: true })]);
        await expect(getResourceCacheEntry<Patient>('Patient', patient.id)).resolves.toBeDefined();

        const updated: WithId<Patient> = { ...patient, active: true };
        await writeResourceCache([buildResourceCacheSet(updated, shardId)]);

        const cacheEntry = await getResourceCacheEntry<Patient>('Patient', patient.id);
        expect(cacheEntry?.resource).toStrictEqual(updated);
        expect(await getCacheRedis().ttl(getResourceCacheKey('Patient', patient.id))).toBeGreaterThan(0);
      } finally {
        await writeResourceCache([buildResourceCacheDelete('Patient', [patient.id])]);
      }
    });
  });

  describe('Shard isolation', () => {
    // No database is configured for this shard, so its repository can only answer from the cache
    const otherShardId = 'other-shard';
    let globalRepo: SystemRepository;
    let otherShardRepo: SystemRepository;

    beforeAll(() => {
      globalRepo = getShardSystemRepo(GLOBAL_SHARD_ID);
      otherShardRepo = getShardSystemRepo(otherShardId);
    });

    afterAll(() => {
      globalRepo[Symbol.dispose]();
      otherShardRepo[Symbol.dispose]();
    });

    test('Records the shard a repository cached an entry from', () =>
      withTestContext(async () => {
        const patient = await globalRepo.createResource<Patient>({ resourceType: 'Patient' });
        try {
          // Populates the cache regardless of the cacheResourcesOnWrite setting
          await globalRepo.readResource('Patient', patient.id);
          await expect(getResourceCacheEntry('Patient', patient.id)).resolves.toMatchObject({
            shardId: GLOBAL_SHARD_ID,
          });
        } finally {
          await writeResourceCache([buildResourceCacheDelete('Patient', [patient.id])]);
        }
      }));

    test('Misses an entry cached from another shard', async () => {
      const patient = buildPatient();
      try {
        await writeResourceCache([buildResourceCacheSet(patient, otherShardId, { force: true })]);
        await expect(
          otherShardRepo.readResource('Patient', patient.id, { checkCacheOnly: true })
        ).resolves.toMatchObject({ id: patient.id });
        await expect(globalRepo.readResource('Patient', patient.id, { checkCacheOnly: true })).rejects.toThrow(
          'Not found'
        );
      } finally {
        await writeResourceCache([buildResourceCacheDelete('Patient', [patient.id])]);
      }
    });

    test('Misses an entry cached from another shard in bulk reads', async () => {
      const patient = buildPatient();
      try {
        await writeResourceCache([buildResourceCacheSet(patient, otherShardId, { force: true })]);
        const [fromOtherShard] = await otherShardRepo.readReferences([{ reference: `Patient/${patient.id}` }]);
        expect(fromOtherShard).toMatchObject({ id: patient.id });

        // The miss falls through to the global database, which does not hold the patient
        const [fromGlobal] = await globalRepo.readReferences([{ reference: `Patient/${patient.id}` }]);
        expect(fromGlobal).toBeInstanceOf(Error);
      } finally {
        await writeResourceCache([buildResourceCacheDelete('Patient', [patient.id])]);
      }
    });

    test('Serves global resource types from any shard', async () => {
      const project: WithId<Project> = { resourceType: 'Project', id: randomUUID(), name: 'Cached project' };
      try {
        await writeResourceCache([buildResourceCacheSet(project, GLOBAL_SHARD_ID, { force: true })]);
        await expect(
          otherShardRepo.readResource('Project', project.id, { checkCacheOnly: true })
        ).resolves.toMatchObject({ id: project.id });
      } finally {
        await writeResourceCache([buildResourceCacheDelete('Project', [project.id])]);
      }
    });

    test('Treats an entry without a shardId as cached from the global shard', async () => {
      const legacy: WithId<Patient> = { resourceType: 'Patient', id: randomUUID() };
      const key = getResourceCacheKey('Patient', legacy.id);
      await getCacheRedis().set(key, stringify({ resource: legacy, projectId: undefined }));
      try {
        await expect(globalRepo.readResource('Patient', legacy.id, { checkCacheOnly: true })).resolves.toMatchObject({
          id: legacy.id,
        });
        await expect(otherShardRepo.readResource('Patient', legacy.id, { checkCacheOnly: true })).rejects.toThrow(
          'Not found'
        );

        // Bulk reads apply the same default. The patient exists only in the cache, so a miss would return an Error
        const [fromGlobal] = await globalRepo.readReferences([{ reference: `Patient/${legacy.id}` }]);
        expect(fromGlobal).toMatchObject({ id: legacy.id });
      } finally {
        await getCacheRedis().del(key);
      }
    });
  });
});

function buildPatient(): WithId<Patient> {
  return {
    resourceType: 'Patient',
    id: randomUUID(),
    meta: {
      project: randomUUID(),
    },
  };
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { stringify } from '@medplum/core';
import type { Patient, Project, Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { initAppServices, shutdownApp } from '../../app';
import { getConfig, loadTestConfig } from '../../config/loader';
import { getCacheRedis } from '../../redis';
import { withTestContext } from '../../test.setup';
import type { SystemRepository } from '../repo';
import { getShardSystemRepo, Repository } from '../repo';
import { GLOBAL_SHARD_ID } from '../sharding';
import type { ResourceCacheSetMode } from './resource-cache';
import {
  buildResourceCacheInvalidation,
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

  test('Sets and reads resource cache entry', async () => {
    const patient = buildPatient();

    try {
      await setCached(patient, shardId);

      const cacheEntry = await getResourceCacheEntry<Patient>('Patient', patient.id.toUpperCase());
      expect(cacheEntry).toStrictEqual({
        resource: patient,
        projectId: patient.meta?.project,
        shardId: shardId,
      });
    } finally {
      await clearCached('Patient', patient.id);
    }
  });

  test('Bulk reads preserve reference order', async () => {
    const patient1 = buildPatient();
    const patient2 = buildPatient();
    const missingId = randomUUID();

    try {
      await setCached(patient1, shardId);
      await setCached(patient2, shardId);

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
      await clearCached('Patient', patient1.id, patient2.id, missingId);
    }
  });

  test('Invalidated entries read as misses until a write replaces them', async () => {
    const patient1 = buildPatient();
    const patient2 = buildPatient();

    try {
      await setCached(patient1, shardId);
      await setCached(patient2, shardId);

      await writeResourceCache([buildResourceCacheInvalidation('Patient', [patient1.id, patient2.id])]);
      await expect(getResourceCacheEntry<Patient>('Patient', patient1.id)).resolves.toBeUndefined();
      await expect(
        getResourceCacheEntries([{ reference: `Patient/${patient1.id}` }, { reference: `Patient/${patient2.id}` }])
      ).resolves.toStrictEqual([undefined, undefined]);

      // A populate cannot replace the invalidation; a write can
      await setCached(patient1, shardId, 'populate');
      await expect(getResourceCacheEntry<Patient>('Patient', patient1.id)).resolves.toBeUndefined();
      await setCached(patient1, shardId);
      await expect(getResourceCacheEntry<Patient>('Patient', patient1.id)).resolves.toMatchObject({
        resource: patient1,
      });
    } finally {
      await clearCached('Patient', patient1.id, patient2.id);
    }
  });

  test('writeResourceCache applies writes in order', async () => {
    const patient = buildPatient();
    try {
      await writeResourceCache([
        buildResourceCacheSet(patient, shardId, 'force'),
        buildResourceCacheInvalidation('Patient', [patient.id]),
      ]);
      await expect(getResourceCacheEntry('Patient', patient.id)).resolves.toBeUndefined();

      await writeResourceCache([
        buildResourceCacheInvalidation('Patient', [patient.id]),
        buildResourceCacheSet(patient, shardId, 'force'),
      ]);
      await expect(getResourceCacheEntry('Patient', patient.id)).resolves.toMatchObject({ resource: patient });

      // A populate never replaces an existing entry
      await setCached({ ...patient, active: true }, shardId, 'populate');
      const entry = await getResourceCacheEntry<Patient>('Patient', patient.id);
      expect(entry?.resource).toStrictEqual(patient);
    } finally {
      await clearCached('Patient', patient.id);
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

    test('A write that finds no entry leaves a short-lived marker that blocks read-fills', async () => {
      const patient = buildPatient();

      try {
        await setCached(patient, shardId);
        await setCached(patient, shardId, 'populate');

        await expect(getResourceCacheEntry<Patient>('Patient', patient.id)).resolves.toBeUndefined();
        const ttl = await getCacheRedis().ttl(getResourceCacheKey('Patient', patient.id));
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(5);
      } finally {
        await clearCached('Patient', patient.id);
      }
    });

    test('Updates existing cache entry', async () => {
      const patient = buildPatient();

      try {
        await setCached(patient, shardId, 'force');
        await expect(getResourceCacheEntry<Patient>('Patient', patient.id)).resolves.toBeDefined();

        const updated: WithId<Patient> = { ...patient, active: true };
        await setCached(updated, shardId);

        const cacheEntry = await getResourceCacheEntry<Patient>('Patient', patient.id);
        expect(cacheEntry?.resource).toStrictEqual(updated);
        expect(await getCacheRedis().ttl(getResourceCacheKey('Patient', patient.id))).toBeGreaterThan(0);
      } finally {
        await clearCached('Patient', patient.id);
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

    /**
     * Reads a patient from the database, running `interleave` after the query returns but before its cache
     * fill lands.
     * @param id - The patient ID.
     * @param interleave - Work that commits while the read is in flight.
     */
    async function readStraddling(id: string, interleave: () => Promise<unknown>): Promise<void> {
      // setCacheEntry is private; this view exposes it to the spy
      const proto = Repository.prototype as unknown as {
        setCacheEntry: (this: Repository, resource: WithId<Resource>, mode?: ResourceCacheSetMode) => Promise<void>;
      };
      const original = proto.setCacheEntry;
      // The reader's cache fill is the first call: its database query has already returned the current version
      const spy = vi.spyOn(proto, 'setCacheEntry').mockImplementationOnce(async function (
        this: Repository,
        resource,
        mode
      ) {
        await interleave();
        return original.call(this, resource, mode);
      });
      try {
        await globalRepo.readResource('Patient', id);
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id }), 'populate');
      } finally {
        spy.mockRestore();
      }
    }

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
          await clearCached('Patient', patient.id);
        }
      }));

    test('Misses an entry cached from another shard', async () => {
      const patient = buildPatient();
      try {
        await setCached(patient, otherShardId, 'force');
        await expect(
          otherShardRepo.readResource('Patient', patient.id, { checkCacheOnly: true })
        ).resolves.toMatchObject({ id: patient.id });
        await expect(globalRepo.readResource('Patient', patient.id, { checkCacheOnly: true })).rejects.toThrow(
          'Not found'
        );
      } finally {
        await clearCached('Patient', patient.id);
      }
    });

    test('Misses an entry cached from another shard in bulk reads', async () => {
      const patient = buildPatient();
      try {
        await setCached(patient, otherShardId, 'force');
        const [fromOtherShard] = await otherShardRepo.readReferences([{ reference: `Patient/${patient.id}` }]);
        expect(fromOtherShard).toMatchObject({ id: patient.id });

        // The miss falls through to the global database, which does not hold the patient
        const [fromGlobal] = await globalRepo.readReferences([{ reference: `Patient/${patient.id}` }]);
        expect(fromGlobal).toBeInstanceOf(Error);
      } finally {
        await clearCached('Patient', patient.id);
      }
    });

    test('Serves global resource types from any shard', async () => {
      const project: WithId<Project> = { resourceType: 'Project', id: randomUUID(), name: 'Cached project' };
      try {
        await setCached(project, GLOBAL_SHARD_ID, 'force');
        await expect(
          otherShardRepo.readResource('Project', project.id, { checkCacheOnly: true })
        ).resolves.toMatchObject({ id: project.id });
      } finally {
        await clearCached('Project', project.id);
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

    test('A database read that straddles a write does not overwrite the written version', () =>
      withTestContext(async () => {
        const v1 = await globalRepo.createResource<Patient>({ resourceType: 'Patient' });
        await clearCached('Patient', v1.id);
        let v2: WithId<Patient> | undefined;
        try {
          await readStraddling(v1.id, async () => {
            v2 = await globalRepo.clone().updateResource<Patient>({ ...v1, active: true });
          });
          assert(v2);
          const entry = await getResourceCacheEntry<Patient>('Patient', v1.id);
          expect(entry?.resource.meta?.versionId).toStrictEqual(v2.meta?.versionId);
        } finally {
          await clearCached('Patient', v1.id);
        }
      }));

    test('A database read that straddles a delete does not re-cache the deleted resource', () =>
      withTestContext(async () => {
        const v1 = await globalRepo.createResource<Patient>({ resourceType: 'Patient' });
        await clearCached('Patient', v1.id);
        try {
          await readStraddling(v1.id, () => globalRepo.clone().deleteResource('Patient', v1.id));
          await expect(getResourceCacheEntry('Patient', v1.id)).resolves.toBeUndefined();
          await expect(globalRepo.readResource('Patient', v1.id)).rejects.toThrow('Gone');

          // Updating the deleted resource re-creates it and replaces the tombstone
          const v2 = await globalRepo.updateResource<Patient>({ ...v1, active: true });
          const entry = await getResourceCacheEntry<Patient>('Patient', v1.id);
          expect(entry?.resource.meta?.versionId).toStrictEqual(v2.meta?.versionId);
        } finally {
          await clearCached('Patient', v1.id);
        }
      }));

    test('A database read that straddles an expunge does not re-cache the expunged resource', () =>
      withTestContext(async () => {
        const v1 = await globalRepo.createResource<Patient>({ resourceType: 'Patient' });
        await clearCached('Patient', v1.id);
        try {
          await readStraddling(v1.id, () => globalRepo.clone().expungeResource('Patient', v1.id));
          await expect(getResourceCacheEntry('Patient', v1.id)).resolves.toBeUndefined();
          await expect(globalRepo.readResource('Patient', v1.id)).rejects.toThrow('Not found');
        } finally {
          await clearCached('Patient', v1.id);
        }
      }));

    test('With cacheResourcesOnWrite disabled, a database read that straddles a write does not cache the old version', () =>
      withTestContext(async () => {
        const prevCacheResourcesOnWrite = getConfig().cacheResourcesOnWrite;
        getConfig().cacheResourcesOnWrite = false;
        const v1 = await globalRepo.createResource<Patient>({ resourceType: 'Patient' });
        await clearCached('Patient', v1.id);
        try {
          // ifMatch keeps the writer's existing-version read inside its transaction, where it does not fill the cache
          await readStraddling(v1.id, () =>
            globalRepo.clone().updateResource<Patient>({ ...v1, active: true }, { ifMatch: v1.meta?.versionId })
          );
          await expect(getResourceCacheEntry('Patient', v1.id)).resolves.toBeUndefined();
        } finally {
          getConfig().cacheResourcesOnWrite = prevCacheResourcesOnWrite;
          await clearCached('Patient', v1.id);
        }
      }));
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

async function setCached(resource: WithId<Resource>, shardId: string, mode?: ResourceCacheSetMode): Promise<void> {
  await writeResourceCache([buildResourceCacheSet(resource, shardId, mode)]);
}

/**
 * Removes entries outright, including invalidation tombstones, so tests start from and leave an empty cache.
 * @param resourceType - The resource type.
 * @param ids - The resource IDs.
 */
async function clearCached(resourceType: ResourceType, ...ids: string[]): Promise<void> {
  await getCacheRedis().del(ids.map((id) => getResourceCacheKey(resourceType, id)));
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Patient, Reference } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import {
  deleteResourceCacheEntries,
  deleteResourceCacheEntry,
  getResourceCacheEntries,
  getResourceCacheEntry,
  getResourceCacheKey,
  setResourceCacheEntry,
} from './resource-cache';

jest.mock('hibp');

describe('Repository resource cache', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Returns resource cache key', () => {
    expect(getResourceCacheKey('Patient', '123')).toStrictEqual('Patient/123');
  });

  test('Sets, reads, and deletes resource cache entry', async () => {
    const patient = buildPatient();

    try {
      await setResourceCacheEntry(patient);

      const cacheEntry = await getResourceCacheEntry<Patient>('Patient', patient.id);
      expect(cacheEntry).toStrictEqual({
        resource: patient,
        projectId: patient.meta?.project,
      });
    } finally {
      await deleteResourceCacheEntry('Patient', patient.id);
    }

    await expect(getResourceCacheEntry<Patient>('Patient', patient.id)).resolves.toBeUndefined();
  });

  test('Bulk reads preserve reference order', async () => {
    const patient1 = buildPatient();
    const patient2 = buildPatient();
    const missingId = randomUUID();

    try {
      await setResourceCacheEntry(patient1);
      await setResourceCacheEntry(patient2);

      const references: Reference[] = [
        { reference: `Patient/${patient1.id}` },
        {},
        { reference: `Patient/${missingId}` },
        { reference: `Patient/${patient2.id}` },
      ];

      const cacheEntries = await getResourceCacheEntries(references);
      expect(cacheEntries).toStrictEqual([
        { resource: patient1, projectId: patient1.meta?.project },
        undefined,
        undefined,
        { resource: patient2, projectId: patient2.meta?.project },
      ]);
    } finally {
      await deleteResourceCacheEntries('Patient', [patient1.id, patient2.id, missingId]);
    }
  });

  test('Deletes resource cache entries', async () => {
    const patient1 = buildPatient();
    const patient2 = buildPatient();

    await setResourceCacheEntry(patient1);
    await setResourceCacheEntry(patient2);

    await deleteResourceCacheEntries('Patient', [patient1.id, patient2.id]);

    await expect(getResourceCacheEntry<Patient>('Patient', patient1.id)).resolves.toBeUndefined();
    await expect(getResourceCacheEntry<Patient>('Patient', patient2.id)).resolves.toBeUndefined();
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

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Observation, Patient, Resource } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { initAppServices, shutdownApp } from '../../../app';
import { loadTestConfig } from '../../../config/loader';
import { getBinaryStorage } from '../../../storage/loader';
import { createTestProject, withTestContext } from '../../../test.setup';
import { Repository } from '../../repo';
import { BulkExporter } from './bulkexporter';

describe('BulkExporter', () => {
  let repo: Repository;

  beforeAll(async () => {
    await initAppServices(await loadTestConfig());
    ({ repo } = await createTestProject({ withRepo: true }));
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(shutdownApp);

  async function startExport(): Promise<BulkExporter> {
    const exporter = new BulkExporter(repo);
    await exporter.start('https://example.com/fhir/R4/$export');
    return exporter;
  }

  test('Rejects the write when the output Binary cannot be created', () =>
    withTestContext(async () => {
      const exporter = await startExport();
      const createResource = Repository.prototype.createResource;
      vi.spyOn(Repository.prototype, 'createResource').mockImplementation(function (this: Repository, resource) {
        if (resource.resourceType === 'Binary') {
          return Promise.reject(new Error('create failed'));
        }
        return createResource.call(this, resource);
      });

      const patient: WithId<Patient> = { resourceType: 'Patient', id: randomUUID() };
      await expect(exporter.writeResource(patient)).rejects.toThrow('create failed');
      // Let any stream error emitted on a later tick surface as an uncaught exception
      await setTimeout(10);
    }));

  test('Finishes creating each output Binary before returning from the write', () =>
    withTestContext(async () => {
      const exporter = await startExport();
      const createResource = Repository.prototype.createResource;
      let inFlight = 0;
      let maxInFlight = 0;
      vi.spyOn(Repository.prototype, 'createResource').mockImplementation(async function (this: Repository, resource) {
        if (resource.resourceType !== 'Binary') {
          return createResource.call(this, resource);
        }
        maxInFlight = Math.max(maxInFlight, ++inFlight);
        try {
          return await createResource.call(this, resource);
        } finally {
          inFlight--;
        }
      });

      await exporter.writeResource({ resourceType: 'Patient', id: randomUUID() } satisfies WithId<Patient>);
      expect(inFlight).toBe(0);
      await exporter.writeResource({
        resourceType: 'Observation',
        id: randomUUID(),
        status: 'final',
        code: { text: 'test' },
      } satisfies WithId<Observation>);
      expect(maxInFlight).toBe(1);
    }));

  test('Rejects a write waiting on backpressure when storing the content fails', () =>
    withTestContext(async () => {
      const exporter = await startExport();
      // Never reads the stream, so the first large write fills the buffer
      vi.spyOn(getBinaryStorage(), 'writeBinary').mockImplementation(async () => {
        await setTimeout(10);
        throw new Error('storage failed');
      });

      const large = (): WithId<Resource> => ({
        resourceType: 'Patient',
        id: randomUUID(),
        name: [{ text: 'x'.repeat(64 * 1024) }],
      });
      await expect(exporter.writeResource(large())).rejects.toThrow('storage failed');
      await expect(exporter.writeResource(large())).rejects.toThrow('storage failed');
      await expect(exporter.closeWriter('Patient')).rejects.toThrow('storage failed');
      await setTimeout(10);
    }));
});

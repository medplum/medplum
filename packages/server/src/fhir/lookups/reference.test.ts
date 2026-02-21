// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Observation, Patient, Practitioner, ServiceRequest } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode } from '../../database';
import { getGlobalSystemRepo } from '../repo';
import { lookupTables } from '../searchparameter';
import type { ReferenceTableRow } from './reference';
import { ReferenceTable } from './reference';

describe('ReferenceTable', () => {
  const systemRepo = getGlobalSystemRepo();
  let refTable: ReferenceTable;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
    const maybeTable = lookupTables.find((table) => table instanceof ReferenceTable);
    if (!maybeTable) {
      throw new Error('ReferenceTable not found in lookupTables');
    }
    refTable = maybeTable;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  function sortFn(a: ReferenceTableRow, b: ReferenceTableRow): number {
    return a.code.localeCompare(b.code);
  }

  describe('getColumnName', () => {
    test('throws not implemented error', () => {
      expect(() => refTable.getColumnName()).toThrow('ReferenceTable.getColumnName not implemented');
    });
  });

  describe('getExistingRows', () => {
    test('returns empty array for empty resources', async () => {
      const rows = await refTable.getExistingRows(systemRepo.getDatabaseClient(DatabaseMode.WRITER), []);
      expect(rows).toEqual([]);
    });
  });

  describe('batchInsertRows', () => {
    test('returns early for empty values without querying DB', async () => {
      const client = systemRepo.getDatabaseClient(DatabaseMode.WRITER);
      const querySpy = jest.spyOn(client, 'query');

      await refTable.batchInsertRows(client, 'Observation', []);

      expect(querySpy).not.toHaveBeenCalled();
      querySpy.mockRestore();
    });
  });

  describe('batchIndexResources', () => {
    test('returns early for empty resources array', async () => {
      const client = systemRepo.getDatabaseClient(DatabaseMode.WRITER);
      const querySpy = jest.spyOn(client, 'query');

      // Should not throw and should return early
      await expect(refTable.batchIndexResources(client, [], true)).resolves.toBeUndefined();

      expect(querySpy).not.toHaveBeenCalled();
      querySpy.mockRestore();
    });

    test('create, update, delete', async () => {
      const patient1 = randomUUID();
      const patient2 = randomUUID();
      const encounterId = randomUUID();

      const obs = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        subject: { reference: 'Patient/' + patient1 },
        status: 'registered',
        code: { coding: [{ system: 'http://loinc.org', code: '3141-9' }] },
      });

      const createRows = await refTable.getExistingRows(systemRepo.getDatabaseClient(DatabaseMode.WRITER), [obs]);
      expect(createRows).toHaveLength(2);
      expect(createRows.sort(sortFn)).toStrictEqual([
        {
          resourceId: obs.id,
          code: 'patient',
          targetId: patient1,
        },
        {
          resourceId: obs.id,
          code: 'subject',
          targetId: patient1,
        },
      ]);

      await systemRepo.updateResource<Observation>({
        ...obs,
        subject: { reference: 'Patient/' + patient2 },
        encounter: { reference: 'Encounter/' + encounterId },
      });

      const updateRows = await refTable.getExistingRows(systemRepo.getDatabaseClient(DatabaseMode.WRITER), [obs]);
      expect(updateRows).toHaveLength(3);
      expect(updateRows.sort(sortFn)).toStrictEqual([
        {
          resourceId: obs.id,
          code: 'encounter',
          targetId: encounterId,
        },
        {
          resourceId: obs.id,
          code: 'patient',
          targetId: patient2,
        },
        {
          resourceId: obs.id,
          code: 'subject',
          targetId: patient2,
        },
      ]);

      await systemRepo.deleteResource('Observation', obs.id);
      const deleteRows = await refTable.getExistingRows(systemRepo.getDatabaseClient(DatabaseMode.WRITER), [obs]);
      expect(deleteRows).toHaveLength(0);
    });

    test('throws error for mixed resource types', async () => {
      const obs: WithId<Observation> = {
        resourceType: 'Observation',
        id: randomUUID(),
        status: 'registered',
        code: { coding: [{ system: 'http://loinc.org', code: '3141-9' }] },
      };

      const patient: WithId<Patient> = {
        resourceType: 'Patient',
        id: randomUUID(),
      };

      await expect(
        refTable.batchIndexResources(systemRepo.getDatabaseClient(DatabaseMode.WRITER), [obs, patient], true)
      ).rejects.toThrow('batchIndexResources must be called with resources of the same type: Patient vs Observation');
    });

    test('handles update with unchanged references', async () => {
      const patientId = randomUUID();

      const obs = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        subject: { reference: 'Patient/' + patientId },
        status: 'registered',
        code: { coding: [{ system: 'http://loinc.org', code: '3141-9' }] },
      });

      // Update with the same reference - should detect no changes
      await systemRepo.updateResource<Observation>({
        ...obs,
        status: 'final', // Change something else, not the reference
      });

      const rows = await refTable.getExistingRows(systemRepo.getDatabaseClient(DatabaseMode.WRITER), [obs]);
      expect(rows).toHaveLength(2);
      expect(rows.sort(sortFn)).toStrictEqual([
        {
          resourceId: obs.id,
          code: 'patient',
          targetId: patientId,
        },
        {
          resourceId: obs.id,
          code: 'subject',
          targetId: patientId,
        },
      ]);
    });

    test('yields between batches for many resources', async () => {
      const patientId = randomUUID();

      // Create more resources than the batch size to test yielding
      const batchSize = 2;
      const resources: WithId<Observation>[] = [];
      for (let i = 0; i < batchSize + 1; i++) {
        resources.push({
          resourceType: 'Observation',
          id: randomUUID(),
          subject: { reference: 'Patient/' + patientId },
          status: 'registered',
          code: { coding: [{ system: 'http://loinc.org', code: '3141-9' }] },
        });
      }

      // This should process all resources with yielding between batches
      await expect(
        refTable.batchIndexResources(systemRepo.getDatabaseClient(DatabaseMode.WRITER), resources, true, batchSize)
      ).resolves.toBeUndefined();

      // Verify at least one resource was indexed
      const rows = await refTable.getExistingRows(systemRepo.getDatabaseClient(DatabaseMode.WRITER), [resources[0]]);
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe('extractValues', () => {
    test('logs and rethrows error when extraction fails', async () => {
      const obs: WithId<Observation> = {
        resourceType: 'Observation',
        id: randomUUID(),
        status: 'registered',
        code: { coding: [{ system: 'http://loinc.org', code: '3141-9' }] },
      };

      const extractError = new Error('Test extraction error');
      const extractValuesSpy = jest.spyOn(refTable, 'extractValues').mockImplementation(() => {
        throw extractError;
      });

      await expect(
        refTable.batchIndexResources(systemRepo.getDatabaseClient(DatabaseMode.WRITER), [obs], true)
      ).rejects.toThrow('Test extraction error');

      extractValuesSpy.mockRestore();
    });

    test('handles resource with contained resource reference', async () => {
      const containedPractitionerId = randomUUID();

      // Create a ServiceRequest with a contained Practitioner
      const serviceRequest = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/' + randomUUID() },
        contained: [
          {
            resourceType: 'Practitioner',
            id: containedPractitionerId,
            name: [{ text: 'Dr. Test' }],
          } as Practitioner,
        ],
        requester: { reference: '#' + containedPractitionerId },
      });

      // The requester reference uses a local reference to contained resource
      // This tests that references are properly extracted
      const rows = await refTable.getExistingRows(systemRepo.getDatabaseClient(DatabaseMode.WRITER), [serviceRequest]);
      expect(rows.length).toBeGreaterThan(0);

      // Verify the subject reference was indexed (patient reference)
      const subjectRow = rows.find((r) => r.code === 'subject');
      expect(subjectRow).toBeDefined();
    });

    test('handles resource with no reference search parameters', async () => {
      // Patient has reference search params like general-practitioner, organization, etc.
      // But creating a minimal Patient with no references should still work
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ text: 'Test Patient' }],
      });

      const rows = await refTable.getExistingRows(systemRepo.getDatabaseClient(DatabaseMode.WRITER), [patient]);
      // Patient with no references should have no reference rows
      expect(rows).toHaveLength(0);
    });
  });
});

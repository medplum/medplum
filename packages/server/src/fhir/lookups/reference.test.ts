// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Observation, Patient, ProjectMembership, ResourceType, ServiceRequest } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { initAppServices, shutdownApp } from '../../app';
import { getConfig, loadTestConfig } from '../../config/loader';
import { systemResourceProjectId } from '../../constants';
import { getLogger, globalLogger } from '../../logger';
import { repoAccess } from '../repository/access-tracker';
import { getTestProjectSystemRepo } from '../repository/test-utils';
import { lookupTables } from '../searchparameter';
import type { PgQueryable } from '../sql';
import { isChainedSearchDisabled, ReferenceTable } from './reference';

describe('ReferenceTable', () => {
  const systemRepo = getTestProjectSystemRepo();
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

  function getReferenceTestClient(resourceTypes: ResourceType | ResourceType[]): PgQueryable {
    return systemRepo.getDatabaseClient(repoAccess.sqlWrite(resourceTypes));
  }

  describe('getColumnName', () => {
    test('throws not implemented error', () => {
      expect(() => refTable.getColumnName()).toThrow('ReferenceTable.getColumnName not implemented');
    });
  });

  describe('getExistingRows', () => {
    test('returns empty array for empty resources', async () => {
      const rows = await refTable.getExistingRows(getReferenceTestClient('Observation'), []);
      expect(rows).toEqual([]);
    });
  });

  describe('batchInsertRows', () => {
    test('returns early for empty values without querying DB', async () => {
      const client = getReferenceTestClient('Observation');
      const querySpy = vi.spyOn(client, 'query');

      await refTable.batchInsertRows(client, 'Observation', []);

      expect(querySpy).not.toHaveBeenCalled();
      querySpy.mockRestore();
    });

    test('overwrites the projectId of a conflicting leftover row', async () => {
      const client = getReferenceTestClient('Observation');
      const resourceId = randomUUID();
      const targetId = randomUUID();
      // Left behind by a resource purged before `projectId` was written; the v53 backfill never
      // revisits a table it has completed, so the insert has to fix it
      await client.query(
        `INSERT INTO "Observation_References" ("resourceId", "targetId", "code") VALUES ($1, $2, 'subject')`,
        [resourceId, targetId]
      );

      const obs: WithId<Observation> = {
        resourceType: 'Observation',
        id: resourceId,
        meta: { project: randomUUID() },
        status: 'final',
        code: { text: 'test' },
        subject: { reference: 'Patient/' + targetId },
      };
      try {
        await expect(refTable.batchIndexResources(client, [obs], true)).resolves.toBeUndefined();

        const rows = await refTable.getExistingRows(client, [obs]);
        expect(rows).toContainEqual({ resourceId, code: 'subject', targetId, projectId: obs.meta?.project });
      } finally {
        await refTable.deleteValuesForResource(client, obs);
      }
    });

    test('inserts a batch that contains the same resource twice', async () => {
      const client = getReferenceTestClient('Observation');
      const obs: WithId<Observation> = {
        resourceType: 'Observation',
        id: randomUUID(),
        meta: { project: randomUUID() },
        status: 'final',
        code: { text: 'test' },
        subject: { reference: 'Patient/' + randomUUID() },
      };

      try {
        await expect(refTable.batchIndexResources(client, [obs, obs], true)).resolves.toBeUndefined();
        const rows = await refTable.getExistingRows(client, [obs]);
        expect(rows.filter((r) => r.code === 'subject')).toHaveLength(1);
      } finally {
        await refTable.deleteValuesForResource(client, obs);
      }
    });

    test('replaces every leftover row when a purged resource is recreated by id', async () => {
      const resourceId = randomUUID();
      const kept = randomUUID();
      const dropped = randomUUID();
      const client = getReferenceTestClient('Observation');
      // Left behind by a resource that was purged without its reference rows; only one collides
      await client.query(
        `INSERT INTO "Observation_References" ("resourceId", "targetId", "code", "projectId")
         VALUES ($1, $2, 'subject', NULL), ($1, $3, 'performer', $4)`,
        [resourceId, kept, dropped, randomUUID()]
      );

      // Clients can choose the id only through an update, which reads and replaces the existing rows
      const obs = await systemRepo.updateResource<Observation>({
        resourceType: 'Observation',
        id: resourceId,
        status: 'final',
        code: { text: 'test' },
        subject: { reference: 'Patient/' + kept },
      });
      try {
        const project = await client.query<{ projectId: string }>(
          `SELECT "projectId" FROM "Observation" WHERE id = $1`,
          [resourceId]
        );
        const rows = await refTable.getExistingRows(client, [obs]);
        expect(rows.map((r) => r.code).sort()).toEqual(['patient', 'subject']);
        expect(rows.every((r) => r.targetId === kept && r.projectId === project.rows[0].projectId)).toBe(true);
      } finally {
        await refTable.deleteValuesForResource(client, obs);
      }
    });

    test('inserts a resource that references the same target twice under one code', async () => {
      const client = getReferenceTestClient('Observation');
      const targetId = randomUUID();
      const obs: WithId<Observation> = {
        resourceType: 'Observation',
        id: randomUUID(),
        meta: { project: randomUUID() },
        status: 'final',
        code: { text: 'test' },
        // Deduped before the insert, so the two references make one row
        performer: [{ reference: 'Practitioner/' + targetId }, { reference: 'Practitioner/' + targetId }],
      };

      try {
        await expect(refTable.batchIndexResources(client, [obs], true)).resolves.toBeUndefined();
        const rows = await refTable.getExistingRows(client, [obs]);
        expect(rows.filter((r) => r.code === 'performer')).toEqual([
          { resourceId: obs.id, code: 'performer', targetId, projectId: obs.meta?.project },
        ]);
      } finally {
        await refTable.deleteValuesForResource(client, obs);
      }
    });
  });

  describe('batchIndexResources', () => {
    test('returns early for empty resources array', async () => {
      const client = getReferenceTestClient('Observation');
      const querySpy = vi.spyOn(client, 'query');

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

      const createRows = await refTable.getExistingRows(getReferenceTestClient(obs.resourceType), [obs]);
      expect(createRows).toContainExactly([
        {
          resourceId: obs.id,
          code: 'patient',
          targetId: patient1,
          projectId: systemResourceProjectId,
        },
        {
          resourceId: obs.id,
          code: 'subject',
          targetId: patient1,
          projectId: systemResourceProjectId,
        },
      ]);

      await systemRepo.updateResource<Observation>({
        ...obs,
        subject: { reference: 'Patient/' + patient2 },
        encounter: { reference: 'Encounter/' + encounterId },
      });

      const updateRows = await refTable.getExistingRows(getReferenceTestClient(obs.resourceType), [obs]);
      expect(updateRows).toContainExactly([
        {
          resourceId: obs.id,
          code: 'encounter',
          targetId: encounterId,
          projectId: systemResourceProjectId,
        },
        {
          resourceId: obs.id,
          code: 'patient',
          targetId: patient2,
          projectId: systemResourceProjectId,
        },
        {
          resourceId: obs.id,
          code: 'subject',
          targetId: patient2,
          projectId: systemResourceProjectId,
        },
      ]);

      await systemRepo.deleteResource('Observation', obs.id);
      const deleteRows = await refTable.getExistingRows(getReferenceTestClient('Observation'), [obs]);
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
        refTable.batchIndexResources(
          getReferenceTestClient([obs.resourceType, patient.resourceType]),
          [obs, patient],
          true
        )
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

      const rows = await refTable.getExistingRows(getReferenceTestClient(obs.resourceType), [obs]);
      expect(rows).toContainExactly([
        {
          resourceId: obs.id,
          code: 'patient',
          targetId: patientId,
          projectId: systemResourceProjectId,
        },
        {
          resourceId: obs.id,
          code: 'subject',
          targetId: patientId,
          projectId: systemResourceProjectId,
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
        refTable.batchIndexResources(getReferenceTestClient(resources[0].resourceType), resources, true, batchSize)
      ).resolves.toBeUndefined();

      // Verify at least one resource was indexed
      const rows = await refTable.getExistingRows(getReferenceTestClient(resources[0].resourceType), [resources[0]]);
      expect(rows.length).toBeGreaterThan(0);
    });

    test('logs the ids of changed resources rather than their contents', async () => {
      const obs = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        subject: { reference: 'Patient/' + randomUUID() },
        status: 'registered',
        code: { coding: [{ system: 'http://loinc.org', code: '3141-9' }] },
      });

      const infoSpy = vi.spyOn(getLogger(), 'info').mockImplementation(() => undefined);
      try {
        await refTable.batchIndexResources(
          getReferenceTestClient(obs.resourceType),
          [{ ...obs, subject: { reference: 'Patient/' + randomUUID() } }],
          false
        );

        // Resources carry PHI, so only their ids belong in a log line
        expect(infoSpy).toHaveBeenCalledWith(
          'Reference changes detected',
          expect.objectContaining({ sampleIds: [obs.id] })
        );
      } finally {
        infoSpy.mockRestore();
      }
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
      const extractValuesSpy = vi.spyOn(refTable, 'extractValues').mockImplementation(() => {
        throw extractError;
      });

      const logErrorSpy = vi.spyOn(globalLogger, 'error').mockImplementation(() => {});
      await expect(refTable.batchIndexResources(getReferenceTestClient(obs.resourceType), [obs], true)).rejects.toThrow(
        'Test extraction error'
      );
      expect(logErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error extracting values'),
        expect.objectContaining({ err: extractError })
      );

      extractValuesSpy.mockRestore();
      logErrorSpy.mockRestore();
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
          },
        ],
        requester: { reference: '#' + containedPractitionerId },
      });

      // The requester reference uses a local reference to contained resource
      // This tests that references are properly extracted
      const rows = await refTable.getExistingRows(getReferenceTestClient(serviceRequest.resourceType), [
        serviceRequest,
      ]);
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

      const rows = await refTable.getExistingRows(getReferenceTestClient(patient.resourceType), [patient]);
      // Patient with no references should have no reference rows
      expect(rows).toHaveLength(0);
    });
  });

  describe('disableChainedSearch', () => {
    afterEach(() => {
      getConfig().disableChainedSearch = undefined;
    });

    test('isChainedSearchDisabled', () => {
      expect(isChainedSearchDisabled('Observation')).toBe(false);

      getConfig().disableChainedSearch = ['Observation', 'ProjectMembership'];
      expect(isChainedSearchDisabled('Observation')).toBe(true);
      expect(isChainedSearchDisabled('Patient')).toBe(false);
      expect(isChainedSearchDisabled('ProjectMembership')).toBe(false);
    });

    test('skips writes on create', async () => {
      getConfig().disableChainedSearch = ['Observation'];

      const obs = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        subject: { reference: 'Patient/' + randomUUID() },
        status: 'registered',
        code: { coding: [{ system: 'http://loinc.org', code: '3141-9' }] },
      });

      const rows = await refTable.getExistingRows(getReferenceTestClient('Observation'), [obs]);
      expect(rows).toHaveLength(0);
    });

    test('skips writes on update, still deletes', async () => {
      const patient1 = randomUUID();
      const obs = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        subject: { reference: 'Patient/' + patient1 },
        status: 'registered',
        code: { coding: [{ system: 'http://loinc.org', code: '3141-9' }] },
      });

      getConfig().disableChainedSearch = ['Observation'];
      await systemRepo.updateResource<Observation>({
        ...obs,
        subject: { reference: 'Patient/' + randomUUID() },
        encounter: { reference: 'Encounter/' + randomUUID() },
      });

      // Existing rows are left stale until reindexed
      const updateRows = await refTable.getExistingRows(getReferenceTestClient('Observation'), [obs]);
      expect(updateRows).toContainExactly([
        { resourceId: obs.id, code: 'patient', targetId: patient1, projectId: systemResourceProjectId },
        { resourceId: obs.id, code: 'subject', targetId: patient1, projectId: systemResourceProjectId },
      ]);

      await systemRepo.deleteResource('Observation', obs.id);
      const deleteRows = await refTable.getExistingRows(getReferenceTestClient('Observation'), [obs]);
      expect(deleteRows).toHaveLength(0);
    });

    test('always writes ProjectMembership references', async () => {
      getConfig().disableChainedSearch = ['ProjectMembership'];

      const projectId = randomUUID();
      const userId = randomUUID();
      const membership: WithId<ProjectMembership> = {
        resourceType: 'ProjectMembership',
        id: randomUUID(),
        meta: { project: projectId },
        project: { reference: 'Project/' + projectId },
        user: { reference: 'User/' + userId },
        profile: { reference: 'Practitioner/' + randomUUID() },
      };
      const client = getReferenceTestClient('ProjectMembership');

      await refTable.batchIndexResources(client, [membership], true);
      const rows = await refTable.getExistingRows(client, [membership]);
      expect(rows).toContainEqual({ resourceId: membership.id, code: 'user', targetId: userId, projectId });

      await refTable.deleteValuesForResource(client, membership);
    });
  });
});

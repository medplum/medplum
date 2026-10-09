// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, getReferenceString, Operator, sleep } from '@medplum/core';
import type { AccessPolicy, AuditEvent, Observation, Patient, Resource } from '@medplum/fhirtypes';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { initAppServices, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import { getLogger } from '../logger';
import * as otelModule from '../otel/otel';
import { createTestProject, waitFor, withTestContext } from '../test.setup';
import { Repository } from './repo';

describe('Saved AuditEvents', () => {
  let previousSaveAuditEvents: boolean | undefined;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    previousSaveAuditEvents = getConfig().saveAuditEvents;
    getConfig().saveAuditEvents = true;
  });

  afterEach(() => {
    getConfig().saveAuditEvents = previousSaveAuditEvents;
  });

  /**
   * Waits for the AuditEvent recording the given repo's user acting on the entity.
   * @param repo - The user's repository.
   * @param entity - The resource the AuditEvent is about.
   * @returns The saved AuditEvent.
   */
  async function waitForAuditEvent(repo: Repository, entity: WithId<Resource>): Promise<WithId<AuditEvent>> {
    let auditEvent: WithId<AuditEvent> | undefined;
    await waitFor(async () => {
      auditEvent = await repo.getSystemRepo().searchOne<AuditEvent>({
        resourceType: 'AuditEvent',
        filters: [
          { code: 'entity', operator: Operator.EQUALS, value: getReferenceString(entity) },
          { code: 'agent', operator: Operator.EQUALS, value: repo.getAuthor().reference as string },
        ],
      });
      assert(auditEvent);
    });
    assert(auditEvent);
    return auditEvent;
  }

  test.each<[string, Partial<AccessPolicy> | undefined]>([
    ['no access policy', undefined],
    [
      'AuditEvent criteria that never match',
      {
        resource: [
          { resourceType: 'Patient' },
          { resourceType: 'Observation' },
          { resourceType: 'ClientApplication', readonly: true },
          { resourceType: 'AuditEvent', criteria: `AuditEvent?_compartment=Organization/${randomUUID()}` },
        ],
      },
    ],
  ])('Saving AuditEvents does not recurse with checkReferencesOnWrite (%s)', (_name, accessPolicy) =>
    withTestContext(async () => {
      const { repo } = await createTestProject({
        withRepo: true,
        project: { checkReferencesOnWrite: true },
        accessPolicy,
      });
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
      await waitForAuditEvent(repo, patient);

      const updateSpy = vi.spyOn(Repository.prototype as any, 'updateResourceImpl');
      try {
        await repo.createResource<Observation>({
          resourceType: 'Observation',
          status: 'final',
          code: { text: 'test' },
          subject: createReference(patient),
        });
        await sleep(1000);

        // One for the create, one for the Patient read by the Observation's own reference check
        const auditEventSaves = updateSpy.mock.calls.filter(([r]) => (r as Resource).resourceType === 'AuditEvent');
        expect(auditEventSaves).toHaveLength(2);
      } finally {
        getConfig().saveAuditEvents = false;
        updateSpy.mockRestore();
      }
    })
  );

  test('Saving AuditEvents for reads inside a transaction does not disturb the transaction connection', () =>
    withTestContext(async () => {
      const errorSpy = vi.spyOn(getLogger(), 'error');
      try {
        const { repo } = await createTestProject({ withRepo: true });
        const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });

        // The read logs its AuditEvent while the transaction holds a connection
        const created = await repo.withTransaction(
          async (txRepo) => {
            await txRepo.readResource<Patient>('Patient', patient.id);
            return txRepo.createResource<Patient>({ resourceType: 'Patient' });
          },
          { resourceTypes: ['Patient'], source: 'test.auditEvent.readInTransaction' }
        );

        await waitForAuditEvent(repo, patient);
        await waitForAuditEvent(repo, created);
        expect(errorSpy).not.toHaveBeenCalledWith('Error processing post-commit callback', expect.anything());
        expect(errorSpy).not.toHaveBeenCalledWith('Failed to save AuditEvent', expect.anything());
      } finally {
        errorSpy.mockRestore();
      }
    }));

  test('Saves AuditEvents with project metadata for users whose access policy does not allow AuditEvent', () =>
    withTestContext(async () => {
      const errorSpy = vi.spyOn(getLogger(), 'error');
      try {
        const compartmentAccount = 'Organization/' + randomUUID();
        const patientAccount = 'Organization/' + randomUUID();
        const profileUrl = 'https://example.com/fhir/StructureDefinition/' + randomUUID();
        const { project, repo } = await createTestProject({
          withRepo: true,
          project: { defaultProfile: [{ resourceType: 'AuditEvent', profile: [profileUrl] }] },
          accessPolicy: {
            compartment: { reference: compartmentAccount },
            resource: [{ resourceType: 'Patient' }],
          },
        });
        const patient = await repo.getSystemRepo().createResource<Patient>({
          resourceType: 'Patient',
          meta: { project: project.id, accounts: [{ reference: patientAccount }] },
        });

        await repo.readResource<Patient>('Patient', patient.id);

        const auditEvent = await waitForAuditEvent(repo, patient);
        expect(auditEvent.agent[0].who).toStrictEqual(repo.getAuthor());
        expect(auditEvent.meta?.author).toStrictEqual({ reference: 'system' });
        expect(auditEvent.meta?.project).toStrictEqual(project.id);
        expect(auditEvent.meta?.accounts).toStrictEqual([
          { reference: compartmentAccount },
          { reference: patientAccount },
        ]);
        expect(auditEvent.meta?.compartment).toStrictEqual(
          expect.arrayContaining([
            { reference: compartmentAccount },
            { reference: patientAccount },
            { reference: getReferenceString(patient) },
          ])
        );
        expect(auditEvent.meta?.profile).toStrictEqual([profileUrl]);
        expect(errorSpy).not.toHaveBeenCalledWith('Failed to save AuditEvent', expect.anything());
      } finally {
        errorSpy.mockRestore();
      }
    }));
  test('Counts saved AuditEvents as system creates', () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({ withRepo: true });
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
      await waitForAuditEvent(repo, patient);

      const counterSpy = vi.spyOn(otelModule, 'incrementCounter');
      try {
        await repo.patchResource<Patient>('Patient', patient.id, [{ op: 'add', path: '/active', value: true }]);
        await waitFor(async () =>
          expect(counterSpy).toHaveBeenCalledWith('medplum.fhir.interaction.create.count', {
            attributes: { system: true, resourceType: 'AuditEvent', result: 'success' },
          })
        );
      } finally {
        counterSpy.mockRestore();
      }
    }));

  test('Counts failed AuditEvent saves as failed system creates', () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({ withRepo: true });
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
      await waitForAuditEvent(repo, patient);

      const original = (Repository.prototype as any).updateResourceImpl;
      const updateSpy = vi.spyOn(Repository.prototype as any, 'updateResourceImpl').mockImplementation(function (
        this: Repository,
        ...args: any[]
      ) {
        if ((args[0] as Resource).resourceType === 'AuditEvent') {
          return Promise.reject(new Error('Simulated AuditEvent save failure'));
        }
        return original.apply(this, args);
      });
      const counterSpy = vi.spyOn(otelModule, 'incrementCounter');
      try {
        await repo.patchResource<Patient>('Patient', patient.id, [{ op: 'add', path: '/active', value: true }]);
        await waitFor(async () =>
          expect(counterSpy).toHaveBeenCalledWith('medplum.fhir.interaction.create.count', {
            attributes: { system: true, resourceType: 'AuditEvent', result: 'failure' },
          })
        );
      } finally {
        counterSpy.mockRestore();
        updateSpy.mockRestore();
      }
    }));
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Patient, Subscription } from '@medplum/fhirtypes';
import type { Mock } from 'vitest';
import { initAppServices, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import { createTestProject, withTestContext } from '../test.setup';
import type { SubscriptionJobData } from '../workers/subscription';
import { getSubscriptionQueue } from '../workers/subscription';
import type { Repository } from './repo';

const FHIRPATH_CRITERIA_URL = 'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression';
const INTERACTION_URL = 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction';

describe('Resend subscriptions', () => {
  let repo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(async () => {
    getConfig().subscriptionsEnabled = true;
    ({ repo } = await withTestContext(() => createTestProject({ withRepo: true, membership: { admin: true } })));
  });

  function createSubscription(
    extension?: Subscription['extension'],
    targetRepo: Repository = repo,
    criteria = 'Patient'
  ): Promise<WithId<Subscription>> {
    return targetRepo.createResource<Subscription>({
      resourceType: 'Subscription',
      reason: 'test',
      status: 'active',
      criteria,
      channel: { type: 'rest-hook', endpoint: 'https://example.com/subscription' },
      extension,
    });
  }

  function clearQueue(): Mock {
    const add = getSubscriptionQueue()?.add as Mock;
    add.mockClear();
    return add;
  }

  function getQueuedJobs(add: Mock): SubscriptionJobData[] {
    return add.mock.calls.map((call) => call[1] as SubscriptionJobData);
  }

  describe('Current version', () => {
    test('Resend current version', () =>
      withTestContext(async () => {
        await createSubscription();
        const v1 = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'One' }] });
        const v2 = await repo.updateResource<Patient>({ ...v1, name: [{ family: 'Two' }] });

        const add = clearQueue();
        await repo.resendSubscriptions('Patient', v1.id);
        const jobs = getQueuedJobs(add);
        expect(jobs).toHaveLength(1);
        expect(jobs[0].versionId).toBe(v2.meta?.versionId);
      }));
  });

  describe('Historical version', () => {
    test('Resend historical version of update', () =>
      withTestContext(async () => {
        const subscription = await createSubscription();
        const v1 = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'One' }] });
        const v2 = await repo.updateResource<Patient>({ ...v1, name: [{ family: 'Two' }] });
        await repo.updateResource<Patient>({ ...v2, name: [{ family: 'Three' }] });

        const add = clearQueue();
        await repo.resendSubscriptions('Patient', v1.id, { versionId: v2.meta?.versionId, interaction: 'update' });

        const jobs = getQueuedJobs(add);
        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({
          subscriptionId: subscription.id,
          resourceType: 'Patient',
          id: v1.id,
          versionId: v2.meta?.versionId,
          interaction: 'update',
        });
      }));

    test('Historical version is compared against the version before it', () =>
      withTestContext(async () => {
        // Only fires when the family name changed from the previous version
        await createSubscription([
          { url: FHIRPATH_CRITERIA_URL, valueString: '%previous.name.family != %current.name.family' },
        ]);
        const v1 = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'One' }] });
        const v2 = await repo.updateResource<Patient>({ ...v1, name: [{ family: 'Two' }] });
        const v3 = await repo.updateResource<Patient>({ ...v2, name: [{ family: 'Two' }], gender: 'female' });
        await repo.updateResource<Patient>({ ...v3, name: [{ family: 'Four' }] });

        // v2 changed the family name relative to v1, so it matches
        let add = clearQueue();
        await repo.resendSubscriptions('Patient', v1.id, { versionId: v2.meta?.versionId });
        expect(getQueuedJobs(add)).toHaveLength(1);

        // v3 did not change the family name relative to v2, so it does not match
        add = clearQueue();
        await repo.resendSubscriptions('Patient', v1.id, { versionId: v3.meta?.versionId });
        expect(getQueuedJobs(add)).toHaveLength(0);
      }));

    test('Previous version is found across history pages', () =>
      withTestContext(async () => {
        await createSubscription([
          {
            url: FHIRPATH_CRITERIA_URL,
            valueString: "%previous.name.family = 'F1' and %current.name.family = 'F2'",
          },
        ]);

        // 102 versions, F0 through F101. History is newest first with 100 entries per page,
        // so F2 is the last entry on the first page and F1 is the first entry on the second page.
        let patient = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'F0' }] });
        let target: WithId<Patient> | undefined;
        for (let i = 1; i <= 101; i++) {
          patient = await repo.updateResource<Patient>({ ...patient, name: [{ family: `F${i}` }] });
          if (i === 2) {
            target = patient;
          }
        }

        const add = clearQueue();
        await repo.resendSubscriptions('Patient', patient.id, { versionId: target?.meta?.versionId });
        expect(getQueuedJobs(add)).toHaveLength(1);
      }));

    test('Resend historical version of create', () =>
      withTestContext(async () => {
        await createSubscription([{ url: INTERACTION_URL, valueCode: 'create' }]);
        const v1 = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'One' }] });
        await repo.updateResource<Patient>({ ...v1, name: [{ family: 'Two' }] });

        const add = clearQueue();
        await repo.resendSubscriptions('Patient', v1.id, { versionId: v1.meta?.versionId, interaction: 'create' });

        const jobs = getQueuedJobs(add);
        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({ versionId: v1.meta?.versionId, interaction: 'create' });
      }));

    test('Resend subscription filter with historical version', () =>
      withTestContext(async () => {
        const sub1 = await createSubscription();
        await createSubscription();
        const v1 = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'One' }] });
        const v2 = await repo.updateResource<Patient>({ ...v1, name: [{ family: 'Two' }] });

        let add = clearQueue();
        await repo.resendSubscriptions('Patient', v1.id, { versionId: v2.meta?.versionId });
        expect(getQueuedJobs(add)).toHaveLength(2);

        add = clearQueue();
        await repo.resendSubscriptions('Patient', v1.id, {
          versionId: v2.meta?.versionId,
          subscription: getReferenceString(sub1),
        });
        const jobs = getQueuedJobs(add);
        expect(jobs).toHaveLength(1);
        expect(jobs[0].subscriptionId).toBe(sub1.id);
      }));

    test('Resend unknown version', () =>
      withTestContext(async () => {
        const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
        await expect(
          repo.resendSubscriptions('Patient', patient.id, { versionId: '00000000-0000-0000-0000-000000000000' })
        ).rejects.toThrow('Not found');
      }));

    test('Resend historical version without extended mode', () =>
      withTestContext(async () => {
        // Normal API requests do not use extended mode, which strips meta.project from read results
        const { repo: nonExtendedRepo } = await createTestProject({
          withRepo: true,
          membership: { admin: true },
          extendedMode: false,
        });
        const subscription = await createSubscription(undefined, nonExtendedRepo);
        const v1 = await nonExtendedRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ family: 'One' }],
        });
        const v2 = await nonExtendedRepo.updateResource<Patient>({ ...v1, name: [{ family: 'Two' }] });
        await nonExtendedRepo.deleteResource('Patient', v1.id);

        const add = clearQueue();
        await nonExtendedRepo.resendSubscriptions('Patient', v1.id, {
          versionId: v1.meta?.versionId,
          interaction: 'create',
        });
        await nonExtendedRepo.resendSubscriptions('Patient', v1.id, { versionId: v2.meta?.versionId });
        await nonExtendedRepo.resendSubscriptions('Patient', v1.id, { interaction: 'delete' });

        const jobs = getQueuedJobs(add);
        expect(jobs).toHaveLength(3);
        expect(jobs[0]).toMatchObject({ subscriptionId: subscription.id, versionId: v1.meta?.versionId });
        expect(jobs[1]).toMatchObject({ subscriptionId: subscription.id, versionId: v2.meta?.versionId });
        expect(jobs[2]).toMatchObject({ subscriptionId: subscription.id, versionId: v2.meta?.versionId });
      }));

    test('Historical version criteria are evaluated against hidden fields', () =>
      withTestContext(async () => {
        // The subscription worker delivers the full version, so criteria must see the full version too
        const { repo: policyRepo } = await createTestProject({
          withRepo: true,
          membership: { admin: true },
          accessPolicy: {
            resource: [{ resourceType: 'Patient', hiddenFields: ['gender'] }, { resourceType: 'Subscription' }],
          },
        });
        await createSubscription(undefined, policyRepo, 'Patient?gender=female');
        const patient = await policyRepo.getSystemRepo().createResource<Patient>({
          resourceType: 'Patient',
          meta: { project: policyRepo.currentProject()?.id },
          gender: 'female',
        });

        const add = clearQueue();
        await policyRepo.resendSubscriptions('Patient', patient.id, {
          versionId: patient.meta?.versionId,
          interaction: 'create',
        });
        expect(getQueuedJobs(add)).toHaveLength(1);
      }));
  });

  describe('Delete', () => {
    async function createAndDeletePatient(): Promise<{ v1: WithId<Patient>; v2: WithId<Patient> }> {
      const v1 = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'One' }] });
      const v2 = await repo.updateResource<Patient>({ ...v1, name: [{ family: 'Two' }] });
      await repo.deleteResource('Patient', v1.id);
      return { v1, v2 };
    }

    test('Resend delete without versionId', () =>
      withTestContext(async () => {
        await createSubscription([{ url: INTERACTION_URL, valueCode: 'delete' }]);
        const { v1, v2 } = await createAndDeletePatient();

        const add = clearQueue();
        await repo.resendSubscriptions('Patient', v1.id, { interaction: 'delete' });

        const jobs = getQueuedJobs(add);
        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({ id: v1.id, versionId: v2.meta?.versionId, interaction: 'delete' });
      }));

    test('Resend delete with the last version before the delete', () =>
      withTestContext(async () => {
        await createSubscription([{ url: INTERACTION_URL, valueCode: 'delete' }]);
        const { v1, v2 } = await createAndDeletePatient();

        const add = clearQueue();
        await repo.resendSubscriptions('Patient', v1.id, { versionId: v2.meta?.versionId, interaction: 'delete' });

        const jobs = getQueuedJobs(add);
        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({ id: v1.id, versionId: v2.meta?.versionId, interaction: 'delete' });
      }));

    test('Resend delete evaluates %previous like the original delete', () =>
      withTestContext(async () => {
        // The original delete uses the deleted resource as both %previous and %current
        await createSubscription([{ url: INTERACTION_URL, valueCode: 'delete' }]);
        await createSubscription([
          { url: INTERACTION_URL, valueCode: 'delete' },
          { url: FHIRPATH_CRITERIA_URL, valueString: '%previous.name.family = %current.name.family' },
        ]);
        const { v1 } = await createAndDeletePatient();

        const add = clearQueue();
        await repo.resendSubscriptions('Patient', v1.id, { interaction: 'delete' });
        expect(getQueuedJobs(add)).toHaveLength(2);
      }));

    test('Resend delete rejects a version other than the last version before the delete', () =>
      withTestContext(async () => {
        const { v1 } = await createAndDeletePatient();
        await expect(
          repo.resendSubscriptions('Patient', v1.id, { versionId: v1.meta?.versionId, interaction: 'delete' })
        ).rejects.toThrow('versionId must be the last version before the delete');
      }));

    test('Resend delete rejects resource that is not deleted', () =>
      withTestContext(async () => {
        const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
        await expect(repo.resendSubscriptions('Patient', patient.id, { interaction: 'delete' })).rejects.toThrow(
          'Precondition Failed'
        );
      }));
  });
});

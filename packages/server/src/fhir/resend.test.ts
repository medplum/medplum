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

  function createSubscription(extension?: Subscription['extension']): Promise<WithId<Subscription>> {
    return repo.createResource<Subscription>({
      resourceType: 'Subscription',
      reason: 'test',
      status: 'active',
      criteria: 'Patient',
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

  test('Historical version is compared against the specified previous version', () =>
    withTestContext(async () => {
      // Only fires when the family name changed from the previous version
      await createSubscription([
        {
          url: 'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression',
          valueString: '%previous.name.family != %current.name.family',
        },
      ]);
      const v1 = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'One' }] });
      const v2 = await repo.updateResource<Patient>({ ...v1, name: [{ family: 'Two' }] });
      const v3 = await repo.updateResource<Patient>({ ...v2, name: [{ family: 'Two' }], gender: 'female' });

      // v2 changed the family name relative to v1, so it matches
      let add = clearQueue();
      await repo.resendSubscriptions('Patient', v1.id, {
        versionId: v2.meta?.versionId,
        previousVersionId: v1.meta?.versionId,
      });
      expect(getQueuedJobs(add)).toHaveLength(1);

      // v3 did not change the family name relative to v2, so it does not match
      add = clearQueue();
      await repo.resendSubscriptions('Patient', v1.id, {
        versionId: v3.meta?.versionId,
        previousVersionId: v2.meta?.versionId,
      });
      expect(getQueuedJobs(add)).toHaveLength(0);
    }));

  test('Resend unknown previous version', () =>
    withTestContext(async () => {
      const v1 = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'One' }] });
      await expect(
        repo.resendSubscriptions('Patient', v1.id, {
          versionId: v1.meta?.versionId,
          previousVersionId: '00000000-0000-0000-0000-000000000000',
        })
      ).rejects.toThrow('Not found');
    }));

  test('Resend historical version of create', () =>
    withTestContext(async () => {
      await createSubscription([
        { url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction', valueCode: 'create' },
      ]);
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

  test('Resend delete', () =>
    withTestContext(async () => {
      await createSubscription([
        { url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction', valueCode: 'delete' },
      ]);
      const v1 = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'One' }] });
      const v2 = await repo.updateResource<Patient>({ ...v1, name: [{ family: 'Two' }] });
      await repo.deleteResource('Patient', v1.id);

      const add = clearQueue();
      await repo.resendSubscriptions('Patient', v1.id, { versionId: v2.meta?.versionId, interaction: 'delete' });

      const jobs = getQueuedJobs(add);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({ id: v1.id, versionId: v2.meta?.versionId, interaction: 'delete' });
    }));

  test('Resend delete requires versionId', () =>
    withTestContext(async () => {
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
      await repo.deleteResource('Patient', patient.id);
      await expect(repo.resendSubscriptions('Patient', patient.id, { interaction: 'delete' })).rejects.toThrow(
        'versionId is required to resend a delete interaction'
      );
    }));

  test('Resend delete rejects resource that is not deleted', () =>
    withTestContext(async () => {
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
      await expect(
        repo.resendSubscriptions('Patient', patient.id, { versionId: patient.meta?.versionId, interaction: 'delete' })
      ).rejects.toThrow('Precondition Failed');
    }));

  test('Resend unknown version', () =>
    withTestContext(async () => {
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
      await expect(
        repo.resendSubscriptions('Patient', patient.id, { versionId: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toThrow('Not found');
    }));

  test('Resend rejects previousVersionId without versionId', () =>
    withTestContext(async () => {
      const v1 = await repo.createResource<Patient>({ resourceType: 'Patient' });
      await expect(
        repo.resendSubscriptions('Patient', v1.id, { previousVersionId: v1.meta?.versionId })
      ).rejects.toThrow('previousVersionId is only supported with versionId and the update interaction');
    }));

  test('Resend rejects previousVersionId with non-update interaction', () =>
    withTestContext(async () => {
      const v1 = await repo.createResource<Patient>({ resourceType: 'Patient' });
      const v2 = await repo.updateResource<Patient>({ ...v1, gender: 'female' });
      await expect(
        repo.resendSubscriptions('Patient', v1.id, {
          versionId: v2.meta?.versionId,
          previousVersionId: v1.meta?.versionId,
          interaction: 'create',
        })
      ).rejects.toThrow('previousVersionId is only supported with versionId and the update interaction');
    }));

  test('Resend current version without versionId still requires current version', () =>
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

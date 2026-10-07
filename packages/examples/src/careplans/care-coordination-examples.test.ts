// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import { OperationOutcomeError } from '@medplum/core';
import type { Bundle, CarePlan, Communication, Task } from '@medplum/fhirtypes';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { claimTask, rerouteToPool, rerouteToProvider } from '../communications/task-routing-examples.js';
import { createCase, findCasePlans } from './longitudinal-tracking-examples.js';

const ready: Task = {
  resourceType: 'Task',
  id: 'response',
  meta: { versionId: '1' },
  status: 'ready',
  intent: 'order',
  focus: { reference: 'Communication/thread' },
  for: { reference: 'Patient/example' },
};
const alice = { reference: 'Practitioner/alice' };
const bob = { reference: 'Practitioner/bob' };
const note = { authorReference: alice, time: '2026-10-06T17:00:00Z', text: 'Transferred for review' };

test('competing claims keep the first owner and do not retry the stale write', async () => {
  let stored = structuredClone(ready);
  let writes = 0;
  const client = {
    async updateResource(resource: Task, options: { headers: Record<string, string> }) {
      writes++;
      if (options.headers['If-Match'] !== `W/"${stored.meta?.versionId}"`) {
        throw new OperationOutcomeError({ resourceType: 'OperationOutcome', id: 'precondition-failed', issue: [] });
      }
      stored = { ...resource, meta: { versionId: '2' } };
      return stored;
    },
  } as unknown as MedplumClient;
  const [first, second] = await Promise.all([claimTask(client, ready, alice), claimTask(client, ready, bob)]);
  assert.equal(first?.owner?.reference, alice.reference);
  assert.equal(second, undefined);
  assert.deepEqual(stored.owner, alice);
  assert.equal(writes, 2);
  assert.equal(ready.owner, undefined);
});

test('claiming rejects unversioned or already owned work before writing', async () => {
  const client = { updateResource: () => assert.fail('Unexpected write') } as unknown as MedplumClient;
  await assert.rejects(claimTask(client, { ...ready, meta: undefined }, alice), /version/);
  await assert.rejects(claimTask(client, { ...ready, owner: bob }, alice), /no longer available/);
  await assert.rejects(claimTask(client, { ...ready, status: 'completed' }, alice), /no longer available/);
});

test('claiming propagates errors other than a stale version', async () => {
  const error = new Error('Network unavailable');
  const client = {
    updateResource: async () => {
      throw error;
    },
  } as unknown as MedplumClient;
  await assert.rejects(claimTask(client, ready, alice), (actual) => actual === error);
});

test('rerouting preserves participants and history and checks both resource versions', async () => {
  const thread: Communication = {
    resourceType: 'Communication',
    id: 'thread',
    meta: { versionId: '7' },
    status: 'in-progress',
    sender: alice,
    recipient: [alice, bob, { reference: 'Patient/example' }],
  };
  const previousNote = { text: 'Original request' };
  let sent: Bundle | undefined;
  const client = {
    executeBatch: async (bundle: Bundle) => {
      sent = bundle;
      return bundle;
    },
  } as unknown as MedplumClient;
  await rerouteToProvider(client, { ...ready, note: [previousNote] }, thread, bob, bob, note);
  assert.equal(sent?.type, 'transaction');
  assert.equal(sent?.entry?.[0].request?.ifMatch, 'W/"1"');
  assert.equal(sent?.entry?.[1].request?.ifMatch, 'W/"7"');
  assert.deepEqual((sent?.entry?.[0].resource as Task).note, [previousNote, note]);
  assert.deepEqual((sent?.entry?.[1].resource as Communication).recipient, thread.recipient);
  const carol = { reference: 'Practitioner/carol' };
  await rerouteToProvider(client, ready, thread, carol, carol, note);
  assert.deepEqual((sent?.entry?.[1].resource as Communication).recipient, [...(thread.recipient ?? []), carol]);
  assert.equal(thread.recipient?.length, 3);
  await assert.rejects(
    rerouteToProvider(client, ready, { ...thread, id: 'another-thread' }, bob, bob, note),
    /thread header/
  );
});

test('returning to a pool changes only the Task and keeps context and prior notes', async () => {
  const role = { coding: [{ system: 'https://example.org/roles', code: 'reviewer' }] };
  const current: Task = {
    ...ready,
    owner: alice,
    status: 'on-hold',
    statusReason: { text: 'Awaiting transfer' },
    note: [{ text: 'Prior note' }],
  };
  const client = {
    async updateResource(resource: Task, options: { headers: Record<string, string> }) {
      assert.equal(options.headers['If-Match'], 'W/"1"');
      return resource;
    },
    executeBatch: () => assert.fail('Pool transfer must not modify the conversation'),
  } as unknown as MedplumClient;
  const result = await rerouteToPool(client, current, role, note);
  assert.equal(result.owner, undefined);
  assert.equal(result.status, 'ready');
  assert.equal(result.statusReason, undefined);
  assert.deepEqual(result.focus, current.focus);
  assert.deepEqual(result.for, current.for);
  assert.deepEqual(result.note, [...(current.note ?? []), note]);
  assert.deepEqual(current.owner, alice);
});

test('case creation reuses stable keys and the returned episode reference after an interrupted run', async () => {
  const records = new Map<string, CarePlan | { resourceType: 'EpisodeOfCare'; id: string }>();
  let failPlan = true;
  const client = {
    async createResourceIfNoneExist(resource: CarePlan | { resourceType: 'EpisodeOfCare' }, query: string) {
      const key = resource.resourceType + query;
      if (resource.resourceType === 'CarePlan' && failPlan) {
        failPlan = false;
        throw new Error('Interrupted before creating the plan');
      }
      if (!records.has(key)) {
        records.set(key, { ...resource, id: `generated-${records.size + 1}` });
      }
      return records.get(key);
    },
  } as unknown as MedplumClient;
  const args = [
    client,
    { reference: 'Patient/example' },
    { reference: 'Organization/example' },
    'enrollment-1',
  ] as const;
  await assert.rejects(createCase(...args), /Interrupted/);
  const result = await createCase(...args);
  assert.equal(records.size, 2);
  assert.equal(result.plan.supportingInfo?.[0].reference, `EpisodeOfCare/${result.episode.id}`);
  assert.deepEqual(await createCase(...args), result);
  assert.equal(records.size, 2);
});

test('case retrieval follows pagination and excludes other episodes for the same patient', async () => {
  const plan = (id: string, episode: string): CarePlan => ({
    resourceType: 'CarePlan',
    id,
    status: 'active',
    intent: 'plan',
    subject: { reference: 'Patient/example' },
    supportingInfo: [{ reference: `EpisodeOfCare/${episode}` }],
  });
  const client = {
    async *searchResourcePages(resourceType: string, query: Record<string, string>) {
      assert.equal(resourceType, 'CarePlan');
      assert.deepEqual(query, { patient: 'Patient/example' });
      yield [plan('other-plan', 'other'), plan('first', 'target')];
      yield [plan('second', 'target')];
    },
  } as unknown as MedplumClient;
  assert.deepEqual(
    (await findCasePlans(client, 'Patient/example', 'EpisodeOfCare/target')).map((plan) => plan.id),
    ['first', 'second']
  );
});

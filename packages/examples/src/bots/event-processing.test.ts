// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { isFhirCriteriaMet } from '@medplum/core';
import type { Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test, vi } from 'vitest';
import { ensureReviewTask, recoverReviews, reviewSubscription } from './event-processing.js';

const source: Task = {
  resourceType: 'Task',
  id: 'preparation',
  status: 'completed',
  intent: 'order',
  code: { coding: [{ system: 'https://example.com/CodeSystem/automation-work', code: 'prepare-review' }] },
  for: { reference: 'Patient/example' },
};

test('a repeated event reuses the review and preserves its progress and patient context', async () => {
  const client = new MockClient({ seedDefaultData: false });
  await client.createResource(source);
  const first = await ensureReviewTask(client, source.id as string);
  if (!first) {
    throw new Error('Expected a review Task');
  }
  expect(first?.for).toEqual(source.for);
  expect(first?.focus?.reference).toBe('Task/preparation');
  expect(first?.status).toBe('ready');
  expect(first?.owner).toBeUndefined();
  const completed = await client.updateResource({ ...first, status: 'completed' });
  const repeated = await ensureReviewTask(client, source.id as string);
  expect(repeated?.id).toBe(completed.id);
  expect(repeated?.status).toBe('completed');
  expect(await client.searchResources('Task')).toHaveLength(2);
});

test('late events re-read current eligibility and reject missing patient context', async () => {
  const client = new MockClient({ seedDefaultData: false });
  await client.createResource({ ...source, status: 'cancelled' });
  expect(await ensureReviewTask(client, source.id as string)).toBeUndefined();
  await client.updateResource({ ...source, for: undefined });
  await expect(ensureReviewTask(client, source.id as string)).rejects.toThrow('Task.for');
  await client.updateResource({ ...source, code: { text: 'Unrelated work' } });
  expect(await ensureReviewTask(client, source.id as string)).toBeUndefined();
  expect(await client.searchResources('Task')).toHaveLength(1);
});

test('recovery follows pages and reuses processing after an interrupted run', async () => {
  const client = new MockClient({ seedDefaultData: false });
  await client.createResource(source);
  await client.createResource({ ...source, id: 'preparation-2' });
  const pages = vi.spyOn(client, 'searchResourcePages').mockImplementation(async function* () {
    yield [source];
    yield [{ ...source, id: 'preparation-2' }];
  } as MedplumClient['searchResourcePages']);
  vi.spyOn(client, 'readResource').mockRejectedValueOnce(new Error('Temporary failure'));
  await expect(recoverReviews(client)).rejects.toThrow('Temporary failure');
  await recoverReviews(client);
  await recoverReviews(client);
  expect(pages).toHaveBeenCalledTimes(3);
  expect(pages).toHaveBeenLastCalledWith('Task', {
    code: 'https://example.com/CodeSystem/automation-work|prepare-review',
    status: 'completed',
  });
  expect(await client.searchResources('Task')).toHaveLength(4);
});

describe('Subscription transition expression', () => {
  test.each([
    [undefined, true],
    [{ ...source, status: 'in-progress' }, true],
    [source, false],
  ] as [Task | undefined, boolean][])('previous state %j matches: %s', async (previous, expected) => {
    expect(await isFhirCriteriaMet(reviewSubscription('bot-id'), source, async () => previous)).toBe(expected);
  });
});

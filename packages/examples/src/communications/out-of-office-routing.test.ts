// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import { OperationOutcomeError } from '@medplum/core';
import type { Communication, Task } from '@medplum/fhirtypes';
import type { Mock } from 'vitest';
import { expect, test, vi } from 'vitest';
import { createOutOfOfficeHandler } from './out-of-office-routing';

const workType = { system: 'https://example.org/work', code: 'respond' };
const role = { coding: [{ system: 'https://example.org/roles', code: 'reviewer' }] };
const event = {
  input: { resourceType: 'Communication', status: 'in-progress', partOf: [{ reference: 'Communication/thread' }] },
} as BotEvent<Communication>;
const owned: Task = {
  resourceType: 'Task',
  id: 'response',
  meta: { versionId: '3' },
  status: 'in-progress',
  intent: 'order',
  code: { coding: [workType] },
  focus: { reference: 'Communication/thread' },
  for: { reference: 'Patient/example' },
  owner: { reference: 'Practitioner/absent' },
  performerType: [role],
};

function clientWithPages(
  pages: Task[][],
  updateResource = vi.fn(async (task: Task) => task)
): {
  client: MedplumClient;
  updateResource: typeof updateResource;
  queries: unknown[];
  patchResource: Mock;
} {
  const queries: unknown[] = [];
  const client = {
    async *searchResourcePages(type: string, query: unknown) {
      queries.push({ type, query });
      for (const page of pages) {
        yield page;
      }
    },
    updateResource,
    patchResource: vi.fn(() => {
      throw new Error('Unexpected patch to participants');
    }),
  };
  return { client: client as unknown as MedplumClient, updateResource, queries, patchResource: client.patchResource };
}

test('reroutes every page of eligible response Tasks without touching thread participants', async () => {
  const { client, updateResource, queries, patchResource } = clientWithPages([
    [owned],
    [{ ...owned, id: 'second', status: 'ready', note: [{ text: 'Existing note' }] }],
  ]);
  await createOutOfOfficeHandler(workType, async () => true)(client, event);
  expect(queries).toEqual([
    {
      type: 'Task',
      query: {
        focus: 'Communication/thread',
        code: `${workType.system}|${workType.code}`,
        status: 'ready,accepted,in-progress',
        'owner:missing': false,
      },
    },
  ]);
  expect(updateResource).toHaveBeenCalledTimes(2);
  const [first, options] = updateResource.mock.calls[0] as unknown as [Task, unknown];
  expect(first).toMatchObject({ status: 'ready', focus: owned.focus, for: owned.for, performerType: [role] });
  expect(first.owner).toBeUndefined();
  expect(first.note).toHaveLength(1);
  expect(options).toEqual({ headers: { 'If-Match': 'W/"3"' } });
  expect(updateResource.mock.calls[1][0].note).toHaveLength(2);
  expect(patchResource).not.toHaveBeenCalled();
  expect(owned.owner).toBeDefined();
});

test('keeps available owners, unowned work, and ambiguous or uncoded pools unchanged', async () => {
  const { client, updateResource } = clientWithPages([
    [
      owned,
      { ...owned, owner: undefined },
      { ...owned, performerType: [role, role] },
      { ...owned, performerType: [{ text: 'Uncoded role' }] },
    ],
  ]);
  const check = vi.fn(async () => false);
  await createOutOfOfficeHandler(workType, check)(client, event);
  expect(check).toHaveBeenCalledTimes(1);
  expect(updateResource).not.toHaveBeenCalled();
});

test('coverage lookup errors preserve the assignment and reach the Bot recovery path', async () => {
  const { client, updateResource } = clientWithPages([[owned]]);
  const handler = createOutOfOfficeHandler(workType, async () => {
    throw new Error('Coverage unavailable');
  });
  await expect(handler(client, event)).rejects.toThrow('Coverage unavailable');
  expect(updateResource).not.toHaveBeenCalled();
});

test('a concurrent reassignment fails without retrying or changing the conversation', async () => {
  const conflict = new OperationOutcomeError({
    resourceType: 'OperationOutcome',
    id: 'precondition-failed',
    issue: [],
  });
  const update = vi.fn(async (_task: Task): Promise<Task> => {
    throw conflict;
  });
  const { client, patchResource } = clientWithPages([[owned]], update);
  await expect(createOutOfOfficeHandler(workType, async () => true)(client, event)).rejects.toBe(conflict);
  expect(update).toHaveBeenCalledTimes(1);
  expect(patchResource).not.toHaveBeenCalled();
});

test('ignores thread headers and rejects an unconfigured work type', async () => {
  const { client, queries } = clientWithPages([[owned]]);
  await createOutOfOfficeHandler(workType, async () => true)(client, {
    ...event,
    input: { ...event.input, partOf: undefined },
  });
  expect(queries).toHaveLength(0);
  expect(() => createOutOfOfficeHandler({ display: 'Respond' }, async () => true)).toThrow('coded response work type');
});

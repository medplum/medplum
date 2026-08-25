// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  assignToPractitionerBatch,
  assignToQueueBatch,
  messagesNotSentByPatients,
  noMessagesInLast30Minutes,
  threadsWithTasks,
} from './communication-data';
import { handler } from './create-respond-to-message-task';

describe('Create Respond to Message Task', async () => {
  let medplum: MockClient;

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async () => {
    medplum = new MockClient();
    // MockClient seeds its example data (e.g. the example message thread) lazily, on the first
    // request. Force that seeding now, then clear it, so it can't match this bot's chained search
    // queries and pollute these tests' results.
    await medplum.searchResources('Communication', {});
    medplum.repo.clear();
  });

  test('No messages in the last 30 minutes', async () => {
    console.log = vi.fn();
    await medplum.executeBatch(noMessagesInLast30Minutes);

    const result = await handler(medplum);
    expect(result).toBe(false);
    expect(console.log).toHaveBeenCalledWith('No messages in the last 30 minutes that require a response.');
  });

  test('Messages in the last 30 minutes not sent by patients', async () => {
    console.log = vi.fn();
    await medplum.executeBatch(messagesNotSentByPatients);

    const result = await handler(medplum);
    expect(result).toBe(false);
    expect(console.log).toHaveBeenCalledWith('No messages in the last 30 minutes that require a response.');
  });

  test('Messages part of thread that already has active task', async () => {
    console.log = vi.fn();
    await medplum.executeBatch(threadsWithTasks);

    const result = await handler(medplum);
    expect(result).toBe(true);
    expect(console.log).toHaveBeenCalledWith('Task already exists for this thread.');
  });

  test('Assign task to care coordinator queue', async () => {
    console.log = vi.fn();
    await medplum.executeBatch(assignToQueueBatch);

    const result = await handler(medplum);
    expect(result).toBe(true);
    expect(console.log).toHaveBeenCalledWith('Task created');
    expect(console.log).toHaveBeenCalledWith('Assigned to care coordinator queue');
  });

  test('Assign to practitioner who previously responded to thread', async () => {
    console.log = vi.fn();
    await medplum.executeBatch(assignToPractitionerBatch);

    const result = await handler(medplum);
    expect(result).toBe(true);
    expect(console.log).toHaveBeenCalledWith('Task created');
    expect(console.log).toHaveBeenCalledWith('Assigned to most recent responder');
  });
});

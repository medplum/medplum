import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Communication, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import {
  assignToPractitionerBatch,
  assignToQueueBatch,
  messagesNotSentByPatients,
  noMessagesInLast30Minutes,
  threadsWithTasks,
} from './communication-data';
import { handler } from './create-respond-to-message-task';

describe('Create Respond to Message Task', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('No messages in the last 30 minutes', async () => {
    const medplum = new MockClient();
    console.log = vi.fn();

    await medplum.executeBatch(noMessagesInLast30Minutes);

    const searchResourcesSpy = vi.spyOn(medplum, 'searchResources').mockImplementation((async () => {
      return [] as Communication[];
    }) as any);

    const result = await handler(medplum);
    expect(result).toBe(false);
    expect(console.log).toHaveBeenCalledWith('No messages in the last 30 minutes that require a response.');
    expect(searchResourcesSpy).toHaveBeenCalledWith('Communication', {
      sent: expect.stringMatching(/^lt/),
      'part-of:Communication.status': 'in-progress',
    });
    searchResourcesSpy.mockRestore();
  });

  test('Messages in the last 30 minutes not sent by patients', async () => {
    const medplum = new MockClient();
    console.log = vi.fn();

    await medplum.executeBatch(messagesNotSentByPatients);

    const searchResourcesSpy = vi.spyOn(medplum, 'searchResources').mockImplementation((async () => {
      return [] as Communication[];
    }) as any);

    const result = await handler(medplum);
    expect(result).toBe(false);
    expect(console.log).toHaveBeenCalledWith('No messages in the last 30 minutes that require a response.');
    expect(searchResourcesSpy).toHaveBeenCalledWith('Communication', {
      sent: expect.stringMatching(/^lt/),
      'part-of:Communication.status': 'in-progress',
    });
    searchResourcesSpy.mockRestore();
  });

  // Skipping until chained search is implemented in MockClient
  test.skip('Messages part of thread that already has active task', async () => {
    const medplum = new MockClient();
    console.log = vi.fn();

    await medplum.executeBatch(threadsWithTasks);

    const result = await handler(medplum);
    expect(result).toBe(true);
    expect(console.log).toHaveBeenCalledWith('Task already exists for this thread.');
  });

  // Skipping until chained search is implemented in MockClient
  test.skip('Assign task to care coordinator queue', async () => {
    const medplum = new MockClient();
    console.log = vi.fn();

    await medplum.executeBatch(assignToQueueBatch);

    const result = await handler(medplum);
    expect(result).toBe(true);
    expect(console.log).toHaveBeenCalledWith('Task created');
    expect(console.log).toHaveBeenCalledWith('Assigned to care coordinator queue');
  });

  // Skipping until chained search is implemented in MockClient
  test.skip('Assign to practitioner who previously responded to thread', async () => {
    const medplum = new MockClient();
    console.log = vi.fn();

    await medplum.executeBatch(assignToPractitionerBatch);

    const result = await handler(medplum);
    expect(result).toBe(true);
    expect(console.log).toHaveBeenCalledWith('Task created');
    expect(console.log).toHaveBeenCalledWith('Assigned to most recent responder');
  });
});

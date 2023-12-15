import { getReferenceString, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, Communication, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './create-respond-to-message-task';

describe('Create Respond to Message Task', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters-medplum.json') as Bundle<SearchParameter>);
  });

  test('No messages in the last 30 minutes', async () => {
    const medplum = new MockClient();
    console.log = vi.fn();

    const sender = await medplum.createResource({
      resourceType: 'Patient',
      name: [
        {
          family: 'Smith',
          given: ['John'],
        },
      ],
    });

    const threadHeader: Communication = await medplum.createResource({
      resourceType: 'Communication',
      sent: new Date().toISOString(),
      status: 'in-progress',
    });

    await medplum.createResource({
      resourceType: 'Communication',
      sent: new Date().toISOString(),
      partOf: [
        {
          reference: getReferenceString(threadHeader),
        },
      ],
      sender: {
        reference: getReferenceString(sender),
      },
    });

    const result = await handler(medplum);
    expect(result).toBe(false);
    expect(console.log).toBeCalledWith('No messages in the last 30 minutes that require a response.');
  });

  test('Messages in the last 30 minutes not sent by patients', async () => {
    const medplum = new MockClient();
    console.log = vi.fn();

    const now = new Date();
    const earlier = new Date(now.getTime() - 15 * 60 * 1000);

    const sender = await medplum.createResource({
      resourceType: 'Practitioner',
      name: [
        {
          family: 'Smith',
          given: ['John'],
        },
      ],
    });

    const threadHeader: Communication = await medplum.createResource({
      resourceType: 'Communication',
      sent: earlier.toISOString(),
      status: 'in-progress',
    });

    await medplum.createResource({
      resourceType: 'Communication',
      sent: earlier.toISOString(),
      partOf: [
        {
          reference: getReferenceString(threadHeader),
        },
      ],
      sender: {
        reference: getReferenceString(sender),
      },
    });

    const result = await handler(medplum);
    expect(result).toBe(false);
    expect(console.log).toBeCalledWith('No messages in the last 30 minutes that require a response.');
  });

  test('Messages part of thread that already has active task', async () => {
    const medplum = new MockClient();
    console.log = vi.fn();

    const now = new Date();
    const earlier = new Date(now.getTime() - 60 * 60 * 1000);

    const sender = await medplum.createResource({
      resourceType: 'Patient',
      name: [
        {
          family: 'Smith',
          given: ['John'],
        },
      ],
    });

    const threadHeader: Communication = await medplum.createResource({
      resourceType: 'Communication',
      sent: earlier.toISOString(),
      status: 'in-progress',
    });

    await medplum.createResource({
      resourceType: 'Communication',
      sent: earlier.toISOString(),
      partOf: [
        {
          reference: getReferenceString(threadHeader),
        },
      ],
      sender: {
        reference: getReferenceString(sender),
      },
    });

    await medplum.createResource({
      resourceType: 'Task',
      focus: {
        reference: getReferenceString(threadHeader),
      },
      status: 'in-progress',
    });

    const currentDate = new Date();
    const thirtyMinutesAgo = new Date(currentDate.getTime() - 30 * 60 * 1000);
    const timeStamp = thirtyMinutesAgo.toISOString();

    const messages = await medplum.searchResources('Communication', {
      sent: `lt${timeStamp}`,
      'part-of:missing': false,
      // 'part-of:Communication.status': 'in-progress',
    });
    console.log(messages[0].partOf);

    await handler(medplum);
    expect(console.log).toBeCalledWith('Task already exists for this thread.');
  });
});

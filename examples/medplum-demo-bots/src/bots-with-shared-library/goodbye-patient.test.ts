import { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './goodbye-patient';

const medplum = new MockClient();

test('Say goodbye', async () => {
  const patient: Patient = await medplum.createResource({
    resourceType: 'Patient',
    name: [
      {
        given: ['Homer'],
        family: 'Simpson',
      },
    ],
  });

  const goodbyeMessage = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: patient,
    contentType: 'text/plain',
    secrets: {},
  });
  expect(goodbyeMessage).toBeDefined();
  expect(goodbyeMessage).toEqual('Goodbye Homer Simpson');
});

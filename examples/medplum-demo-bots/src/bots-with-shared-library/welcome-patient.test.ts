import { MockClient } from '@medplum/mock';
import { handler } from './welcome-patient';
import { test, expect } from 'vitest';
import { Patient } from '@medplum/fhirtypes';

const medplum = new MockClient();

test('Welcome Patient', async () => {
  const patient: Patient = await medplum.createResource({
    resourceType: 'Patient',
    name: [
      {
        given: ['Marge'],
        family: 'Simpson',
      },
    ],
  });

  const welcomeMessage = await handler(medplum, { input: patient, secrets: {}, contentType: 'text/plain' });
  expect(welcomeMessage).toBeDefined();
  expect(welcomeMessage).toEqual('Welcome Marge Simpson');
});

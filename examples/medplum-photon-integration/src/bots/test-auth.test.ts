import { handler } from './test-auth';
import { allOk } from '@medplum/core';
import { MockClient } from '@medplum/mock';

test.skip('Success', async () => {
  const medplum = new MockClient();

  const result = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: '',
    contentType: 'application/fhir+json',
    secrets: {
      CLIENT_ID: { name: 'PHOTON_CLIENT_ID', valueString: '123456789' },
      CLIENT_SECRET: { name: 'PHOTON_CLIENT_SECRET', valueString: '987654321' },
    },
  });

  expect(result).toBe(allOk);
});

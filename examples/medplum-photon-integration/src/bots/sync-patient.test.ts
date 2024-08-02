import { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './sync-patient';

test.skip('Successful sync', async () => {
  const medplum = new MockClient();
  const patient: Patient = {
    resourceType: 'Patient',
    name: [{ given: ['Homer'], family: 'Simpson' }],
    telecom: [
      { system: 'phone', value: '2125559839' },
      { system: 'email', value: 'homersimpson56@aol.com' },
    ],
    birthDate: '1956-05-12',
  };

  const photonId = await handler(medplum, {
    input: patient,
    bot: { reference: 'Bot/123' },
    secrets: {
      PHOTON_CLIENT_ID: { name: 'PHOTON_CLIENT_ID', valueString: '1234567890' },
      PHOTON_CLIENT_SECRET: { name: 'PHOTON_CLIENT_SECRET', valueString: '0987654321' },
    },
    contentType: 'application/fhir+json',
  });

  expect(photonId).toBeDefined();
});

import { createReference } from '@medplum/core';
import { Coverage, Organization, Patient, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './eligibility-check-opkit';

const contentType = 'application/fhir+json';

/*
This test will not work without a valid OpKit API Key.
Add your API key to the top of `eligibility-check-opkit.ts` and
then enable this test.
*/

test.skip('Success', async () => {
  const medplum = new MockClient();

  const practitioner = await medplum.createResource<Practitioner>({
    resourceType: 'Practitioner',
    name: [
      {
        given: ['Given Name'],
        family: 'Family Name',
      },
    ],
    identifier: [
      {
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
              code: 'NPI',
            },
          ],
        },
        system: 'http://hl7.org/fhir/sid/us-npi',
        value: '123456789',
      },
    ],
  });

  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Michael'], family: 'Scott' }],
    birthDate: '01-01-2000',
    gender: 'male',
    telecom: [
      {
        system: 'email',
        value: 'michael@example.com',
      },
    ],
    generalPractitioner: [createReference(practitioner)],
  });

  const org = await medplum.createResource<Organization>({
    resourceType: 'Organization',
    name: 'THE OFFICE INSURANCE COMPANY',
    identifier: [
      {
        system: 'https://docs.opkit.co/reference/getpayers',
        value: 'dcc25e45-9110-4f39-9a56-2306b5430bd0',
      },
    ],
  });

  const input: Coverage = {
    resourceType: 'Coverage',
    id: '52e9f3e8-0b9d-47ca-b1af-1f9750c0e7c6',
    beneficiary: createReference(patient),
    subscriber: createReference(patient),
    payor: [createReference(org)],
    subscriberId: '123',
    status: 'active',
  };

  const result = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input,
    contentType,
    secrets: { OPKIT_API_KEY: { name: 'OPKIT_API_KEY', valueString: '1234567890' } },
  });
  expect(result).toBe(true);
});

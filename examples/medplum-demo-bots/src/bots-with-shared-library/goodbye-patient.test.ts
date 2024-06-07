import { Bundle, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './goodbye-patient';
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';

const medplum = new MockClient();

beforeAll(() => {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
  for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
    indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
  }
});

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

import { getIdentifier, indexSearchParameterBundle, indexStructureDefinitionBundle, resolveId } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { MockClient } from '@medplum/mock';
import { Patient, Bundle, SearchParameter } from '@medplum/fhirtypes';

import { handler } from './epic-query-patient';

describe.skip('epic-query-patient', () => {
  let medplum: MockClient;

  const bot = { reference: 'Bot/123' };
  const contentType = 'application/fhir+json';
  const secrets = {
    EPIC_PRIVATE_KEY: { name: 'EPIC_PRIVATE_KEY', valueString: 'test-private-key' },
    EPIC_CLIENT_ID: { name: 'EPIC_CLIENT_ID', valueString: 'test-client-id' },
  };

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(() => {
    medplum = new MockClient();
  });

  test('throws error when missing EPIC_CLIENT_ID', async () => {
    await expect(
      handler(medplum, {
        bot,
        input: {},
        secrets: { EPIC_PRIVATE_KEY: secrets.EPIC_PRIVATE_KEY },
        contentType,
      })
    ).rejects.toThrow('Missing EPIC_CLIENT_ID');
  });

  test('throws error when missing EPIC_PRIVATE_KEY', async () => {
    await expect(
      handler(medplum, {
        bot,
        input: {},
        secrets: { EPIC_CLIENT_ID: secrets.EPIC_CLIENT_ID },
        contentType,
      })
    ).rejects.toThrow('Missing EPIC_PRIVATE_KEY');
  });

  test('successfully upserts a Epic patient and related resources in Medplum', async () => {
    const patient = await handler(medplum, {
      bot,
      input: {},
      secrets,
      contentType,
    });

    expect(patient).toBeDefined();
    expect(patient?.resourceType).toStrictEqual('Patient');
    expect(
      getIdentifier(patient as Patient, 'http://open.epic.com/FHIR/StructureDefinition/patient-fhir-id')
    ).toStrictEqual('erXuFYUfucBZaryVksYEcMg3');

    expect(patient?.managingOrganization).toBeDefined();
    const managingOrganization = medplum.readResource(
      'Organization',
      resolveId(patient?.managingOrganization) as string
    );
    expect(managingOrganization).toBeDefined();

    expect(patient?.generalPractitioner).toHaveLength(1);
    const generalPractitioner = medplum.readResource(
      'Practitioner',
      resolveId(patient?.generalPractitioner?.[0]) as string
    );
    expect(generalPractitioner).toBeDefined();
  });
});

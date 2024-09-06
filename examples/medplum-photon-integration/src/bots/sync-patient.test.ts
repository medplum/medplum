import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { createAllergyInputs, createMedHistoryInputs, handler } from './sync-patient';

describe('Sync patient', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

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

  test.skip('Create allergy input with identifiers', async () => {
    const medplum = new MockClient();

    await medplum.executeBatch(allergies);
    const patient = (await medplum.searchOne('Patient', {
      identifier: 'https://example.org|homer-simpson',
    })) as Patient;

    const inputs = await createAllergyInputs(patient, medplum, 'authToken');

    expect(inputs).toBeDefined();
    expect(inputs?.length).toBe(2);
  });

  test.skip('Create medication history input with identifiers', async () => {
    const medplum = new MockClient();
    await medplum.executeBatch(medications);
    const patient = (await medplum.searchOne('Patient', {
      identifier: 'https://example.org|marge-simpson',
    })) as Patient;

    const inputs = await createMedHistoryInputs(patient, medplum, 'authToken');

    expect(inputs).toBeDefined();
    expect(inputs?.length).toBe(2);
  });

  test.skip('Create valid mutation body', async () => {
    const medplum = new MockClient();
    await medplum.executeBatch(fullData);
    const patient = (await medplum.searchOne('Patient', {
      identifier: 'https://example.org|homer-simpson',
    })) as Patient;

    const result = await handler(medplum, {
      input: patient,
      bot: { reference: 'Bot/123' },
      secrets: {
        PHOTON_CLIENT_ID: { name: 'PHOTON_CLIENT_ID', valueString: '1234567890' },
        PHOTON_CLIENT_SECRET: { name: 'PHOTON_CLIENT_SECRET', valueString: '0987654321' },
      },
      contentType: 'application/json',
    });

    expect(result).toBeDefined();
    expect(result.id.slice(0, 4)).toBe('pat_');
  });
});

const allergies: Bundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [
    {
      fullUrl: 'urn:uuid:12fb98db-ebf6-485c-a038-2ba40a389fbf',
      request: { method: 'POST', url: 'Patient' },
      resource: {
        resourceType: 'Patient',
        identifier: [{ system: 'https://example.org', value: 'homer-simpson' }],
        name: [{ given: ['Homer'], family: 'Simpson' }],
        telecom: [
          { system: 'phone', value: '2125559839' },
          { system: 'email', value: 'homersimpson@aol.com' },
        ],
        birthDate: '1956-05-12',
      },
    },
    {
      fullUrl: 'urn:uuid:b2136130-a51a-4489-b82c-240b21b89302',
      request: { method: 'POST', url: 'AllergyIntolerance' },
      resource: {
        resourceType: 'AllergyIntolerance',
        identifier: [{ system: 'https://neutron.health', value: 'intolerance1' }],
        patient: { reference: 'urn:uuid:12fb98db-ebf6-485c-a038-2ba40a389fbf' },
        note: [{ text: 'These allergies freaking stinks!' }],
        onsetDateTime: new Date('1984-08-08').toISOString(),
      },
    },
    {
      fullUrl: 'urn:uuid:d1aaf501-368a-4dab-8292-2c9ae221e5d1',
      request: { method: 'POST', url: 'AllergyIntolerance' },
      resource: {
        resourceType: 'AllergyIntolerance',
        identifier: [{ system: 'https://neutron.health', value: 'intolerance2' }],
        patient: { reference: 'urn:uuid:12fb98db-ebf6-485c-a038-2ba40a389fbf' },
        note: [{ text: 'Allergic :(' }],
        onsetDateTime: new Date('1991-11-22').toISOString(),
      },
    },
  ],
};

const medications: Bundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [
    {
      fullUrl: 'urn:uuid:8a06c6fb-4880-47c0-a048-60b70cd56f0a',
      request: { method: 'POST', url: 'Patient' },
      resource: {
        resourceType: 'Patient',
        identifier: [{ system: 'https://example.org', value: 'marge-simpson' }],
        name: [{ given: ['Marge'], family: 'Simpson' }],
        telecom: [
          { system: 'phone', value: '2125559839' },
          { system: 'email', value: 'margesimpson@yahoo.com' },
        ],
        birthDate: '1959-01-22',
      },
    },
    {
      fullUrl: 'urn:uuid:c663b3ec-af82-4724-a63d-256a1b79e57b',
      request: { method: 'POST', url: 'MedicationRequest' },
      resource: {
        resourceType: 'MedicationRequest',
        identifier: [{ system: 'https://neutron.health', value: 'med-request1' }],
        status: 'active',
        subject: { reference: 'urn:uuid:8a06c6fb-4880-47c0-a048-60b70cd56f0a' },
        intent: 'order',
        note: [{ text: 'New meds' }],
      },
    },
    {
      fullUrl: 'urn:uuid: 862689b3-6580-4aaf-85a0-2dd18a58b0b3',
      request: { method: 'POST', url: 'MedicationRequest' },
      resource: {
        resourceType: 'MedicationRequest',
        identifier: [{ system: 'https://neutron.health', value: 'med-request2' }],
        status: 'active',
        subject: { reference: 'urn:uuid:8a06c6fb-4880-47c0-a048-60b70cd56f0a' },
        intent: 'filler-order',
        note: [{ text: 'Refill' }],
      },
    },
  ],
};

const fullData: Bundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [
    {
      fullUrl: 'urn:uuid:12fb98db-ebf6-485c-a038-2ba40a389fbf',
      request: { method: 'POST', url: 'Patient' },
      resource: {
        resourceType: 'Patient',
        identifier: [{ system: 'https://example.org', value: 'homer-simpson' }],
        name: [{ given: ['Homer'], family: 'Simpson' }],
        telecom: [
          { system: 'phone', value: '2125559839' },
          { system: 'email', value: 'homersimpson@aol.com' },
        ],
        birthDate: '1956-05-12',
      },
    },
    {
      fullUrl: 'urn:uuid:b2136130-a51a-4489-b82c-240b21b89302',
      request: { method: 'POST', url: 'AllergyIntolerance' },
      resource: {
        resourceType: 'AllergyIntolerance',
        identifier: [{ system: 'https://neutron.health', value: 'intolerance1' }],
        patient: { reference: 'urn:uuid:12fb98db-ebf6-485c-a038-2ba40a389fbf' },
        note: [{ text: 'These allergies freaking stinks!' }],
        onsetDateTime: new Date('1984-08-08').toISOString(),
      },
    },
    {
      fullUrl: 'urn:uuid:d1aaf501-368a-4dab-8292-2c9ae221e5d1',
      request: { method: 'POST', url: 'AllergyIntolerance' },
      resource: {
        resourceType: 'AllergyIntolerance',
        identifier: [{ system: 'https://neutron.health', value: 'intolerance2' }],
        patient: { reference: 'urn:uuid:12fb98db-ebf6-485c-a038-2ba40a389fbf' },
        note: [{ text: 'Allergic :(' }],
        onsetDateTime: new Date('1991-11-22').toISOString(),
      },
    },
    {
      fullUrl: 'urn:uuid:c663b3ec-af82-4724-a63d-256a1b79e57b',
      request: { method: 'POST', url: 'MedicationRequest' },
      resource: {
        resourceType: 'MedicationRequest',
        identifier: [{ system: 'https://neutron.health', value: 'med-request1' }],
        status: 'active',
        subject: { reference: 'urn:uuid:12fb98db-ebf6-485c-a038-2ba40a389fbf' },
        intent: 'order',
        note: [{ text: 'New meds' }],
      },
    },
    {
      fullUrl: 'urn:uuid: 862689b3-6580-4aaf-85a0-2dd18a58b0b3',
      request: { method: 'POST', url: 'MedicationRequest' },
      resource: {
        resourceType: 'MedicationRequest',
        identifier: [{ system: 'https://neutron.health', value: 'med-request2' }],
        status: 'active',
        subject: { reference: 'urn:uuid:12fb98db-ebf6-485c-a038-2ba40a389fbf' },
        intent: 'filler-order',
        note: [{ text: 'Refill' }],
      },
    },
  ],
};

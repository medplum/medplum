// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  createReference,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bot, Bundle, Patient, Reference, SearchParameter } from '@medplum/fhirtypes';
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

  const bot: Reference<Bot> = { reference: 'Bot/123' };
  const contentType = 'application/json';
  const secrets = {
    PHOTON_CLIENT_ID: { name: 'Photon Client ID', valueString: 'client-id' },
    PHOTON_CLIENT_SECRET: { name: 'Photon Client Secret', valueString: 'client-secret' },
  };

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

    const photonId = await handler(medplum, { input: patient, bot, secrets, contentType });

    expect(photonId).toBeDefined();
  });

  test.skip('Create allergy input with identifiers', async () => {
    const medplum = new MockClient();

    await medplum.executeBatch(allergies);
    const patient = (await medplum.searchOne('Patient', {
      identifier: 'https://example.org|homer-simpson',
    })) as Patient;
    const allergyIntolerances = await medplum.searchResources('AllergyIntolerance', {
      patient: getReferenceString(patient),
    });

    const inputs = await createAllergyInputs('auth-token', allergyIntolerances);

    expect(inputs).toBeDefined();
    expect(inputs?.length).toBe(2);
  });

  test.skip('Create medication history input with identifiers', async () => {
    const medplum = new MockClient();
    await medplum.executeBatch(medications);
    const patient = (await medplum.searchOne('Patient', {
      identifier: 'https://example.org|marge-simpson',
    })) as Patient;
    const medicationHistory = await medplum.searchResources('MedicationRequest', {
      patient: getReferenceString(patient),
    });

    const inputs = await createMedHistoryInputs('auth-token', medicationHistory);

    expect(inputs).toBeDefined();
    expect(inputs?.length).toBe(2);
  });

  test.skip('Create valid mutation body', async () => {
    const medplum = new MockClient();
    await medplum.executeBatch(fullData);
    const patient = (await medplum.searchOne('Patient', {
      identifier: 'https://example.org|homer-simpson',
    })) as Patient;

    const result = await handler(medplum, { input: patient, bot, secrets, contentType });

    expect(result).toBeDefined();
    expect(result.id.slice(0, 4)).toBe('pat_');
  });

  test.skip('Create patient with allergies', async () => {
    const medplum = new MockClient();

    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['Alice'] }],
      telecom: [
        { system: 'phone', value: '9085553329' },
        { system: 'email', value: 'alices01@alice.com' },
      ],
      address: [{ line: ['3 Green Street'], city: 'Salt Lake City', state: 'UT', postalCode: '84044' }],
      gender: 'female',
      birthDate: '1974-03-22',
    });

    await medplum.createResource({
      resourceType: 'AllergyIntolerance',
      patient: createReference(patient),
      code: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '1000112',
            display: 'medroxyprogesterone acetate',
          },
        ],
      },
      type: 'allergy',
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
            code: 'active',
            display: 'Active',
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
            code: 'confirmed',
            display: 'Confirmed',
          },
        ],
      },
      criticality: 'low',
    });

    const result = await handler(medplum, { bot, contentType, secrets, input: patient });
    expect(result.allergies?.length).toBe(1);
    expect(result.allergies?.[0].allergen.id).toBeDefined();
  }, 10000);

  test.skip('Create patient with medication history', async () => {
    const medplum = new MockClient();

    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['Alice'] }],
      telecom: [
        { system: 'phone', value: '9085553329' },
        { system: 'email', value: 'alices01@alice.com' },
      ],
      address: [{ line: ['3 Green Street'], city: 'Salt Lake City', state: 'UT', postalCode: '84044' }],
      gender: 'female',
      birthDate: '1974-03-22',
    });

    await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'filler-order',
      subject: createReference(patient),
      medicationCodeableConcept: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '313252',
            display: 'tetracycline hydrochloride 250 MG Oral Tablet',
          },
        ],
      },
    });

    const result = await handler(medplum, { bot, contentType, secrets, input: patient });
    expect(result.medicationHistory?.length).toBe(1);
  }, 10000);
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
        patient: { reference: 'urn:uuid:12fb98db-ebf6-485c-a038-2ba40a389fbf' },
        note: [{ text: 'Allergies' }],
        onsetDateTime: new Date('1984-08-08').toISOString(),
        code: {
          coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '2378832', display: '10-undecenal' }],
        },
      },
    },
    {
      fullUrl: 'urn:uuid:d1aaf501-368a-4dab-8292-2c9ae221e5d1',
      request: { method: 'POST', url: 'AllergyIntolerance' },
      resource: {
        resourceType: 'AllergyIntolerance',
        patient: { reference: 'urn:uuid:12fb98db-ebf6-485c-a038-2ba40a389fbf' },
        note: [{ text: 'Allergies' }],
        onsetDateTime: new Date('1991-11-22').toISOString(),
        code: {
          coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '1013676', display: '300 PRO LA' }],
        },
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
        status: 'active',
        subject: { reference: 'urn:uuid:8a06c6fb-4880-47c0-a048-60b70cd56f0a' },
        intent: 'order',
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '351993',
              display: 'GONAL -f 600 UNT/ML Injectable Solution',
            },
          ],
        },
        note: [{ text: 'New meds' }],
      },
    },
    {
      fullUrl: 'urn:uuid: 862689b3-6580-4aaf-85a0-2dd18a58b0b3',
      request: { method: 'POST', url: 'MedicationRequest' },
      resource: {
        resourceType: 'MedicationRequest',
        status: 'active',
        subject: { reference: 'urn:uuid:8a06c6fb-4880-47c0-a048-60b70cd56f0a' },
        intent: 'filler-order',
        note: [{ text: 'Refill' }],
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '313252',
              display: 'tetracycline hydrochloride 250 MG Oral Tablet',
            },
          ],
        },
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

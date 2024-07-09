import { getReferenceString, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import {
  AllergyIntolerance,
  Bundle,
  MedicationRequest,
  Patient,
  Practitioner,
  SearchParameter,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './sync-patient';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';

describe('Sync patients', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('Success', async () => {
    const medplum = new MockClient();

    const patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ family: 'Simpson', given: ['Homer'] }],
      birthDate: '05-12-1956',
      gender: 'male',
      telecom: [
        {
          system: 'email',
          value: 'homersimpson@aol.com',
        },
        {
          system: 'phone',
          value: '2025558393',
        },
      ],
    });

    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ family: 'Smith', given: ['Alice'], prefix: ['Dr.'] }],
      telecom: [
        {
          system: 'email',
          value: 'alicesmith@aol.com',
        },
        {
          system: 'phone',
          value: '9085551834',
        },
      ],
      address: [{ line: ['393 May Drive'], city: 'Ralston', state: 'TX' }],
    });

    await medplum.createResource<AllergyIntolerance>({
      resourceType: 'AllergyIntolerance',
      patient: { reference: getReferenceString(patient) },
      onsetDateTime: '04-30-2008',
      code: {
        coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '124427', display: 'honey bee venom' }],
      },
    });

    await medplum.createResource<MedicationRequest>({
      resourceType: 'MedicationRequest',
      status: 'active',
      subject: { reference: getReferenceString(patient) },
      intent: 'order',
      requester: { reference: getReferenceString(practitioner) },
      medicationCodeableConcept: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '723',
            display: 'amoxicillin',
          },
        ],
      },
      dispenseRequest: {
        initialFill: {
          quantity: {
            value: 5,
            unit: 'pills',
          },
        },
        numberOfRepeatsAllowed: 3,
      },
      dosageInstruction: [
        {
          patientInstruction: 'Take by mouth with water every night before bed',
        },
      ],
      note: [{ text: 'Prescription to be reviewed after third refill' }],
    });

    await handler(medplum, {
      input: patient,
      bot: { reference: 'Bot/123' },
      contentType: 'application/fhir+json',
      secrets: {},
    });
  });
});

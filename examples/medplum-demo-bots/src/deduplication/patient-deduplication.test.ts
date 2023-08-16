import { indexSearchParameterBundle, indexStructureDefinitionBundle, createReference } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './patient-deduplication';

// npm t src/examples/patient-deduplication.test.ts
// This test demostrates a automatically linking patients with three matching identifiers
describe('Link Patient', async () => {
  // Load the FHIR definitions to enable search parameter indexing
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  test('Does not create RiskAssessment due to doNotMatch List', async () => {
    const medplum = new MockClient();
    // Create an original Patient with several identifiers
    const patient1: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'SS',
                display: 'Social Security Number',
              },
            ],
            text: 'Social Security Number',
          },
          system: 'http://hl7.org/fhir/sid/us-ssn',
          value: '999-47-5984',
        },
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'DL',
                display: "Driver's License",
              },
            ],
            text: "Driver's License",
          },
          system: 'urn:oid:2.16.840.1.113883.4.3.25',
          value: 'S99985931',
        },
      ],
      birthDate: '1948-07-01',
      name: [
        {
          family: 'Smith',
          given: ['John'],
        },
      ],
      gender: 'male',
    });

    // Create a new Patient with a matching single identifier
    const patient2: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'SS',
                display: 'Social Security Number',
              },
            ],
            text: 'Social Security Number',
          },
          system: 'http://hl7.org/fhir/sid/us-ssn',
          value: '999-47-5984',
        },
      ],
      birthDate: '1948-07-01',
      name: [
        {
          family: 'Smith',
          given: ['John'],
        },
      ],
      gender: 'male',
    });

    await medplum.createResource({
      resourceType: 'List',
      code: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/list-example-use-codes',
            code: 'doNotMatch',
            display: 'Do Not Match',
          },
        ],
        text: 'Do Not Match',
      },
      subject: createReference(patient2),
      entry: [
        {
          item: {
            reference: 'Patient/' + patient1.id,
          },
        },
      ],
    });

    const contentType = 'application/fhir+json';

    await handler(medplum, { input: patient2, contentType, secrets: {} });

    const riskAssessment = await medplum.searchResources('RiskAssessment');
    expect(riskAssessment.length).toBe(0);
  });

  test('Created RiskAssessment', async () => {
    const medplum = new MockClient();
    // Create an original Patient with several identifiers
    await medplum.createResource({
      resourceType: 'Patient',
      identifier: [
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'SS',
                display: 'Social Security Number',
              },
            ],
            text: 'Social Security Number',
          },
          system: 'http://hl7.org/fhir/sid/us-ssn',
          value: '999-47-5984',
        },
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'DL',
                display: "Driver's License",
              },
            ],
            text: "Driver's License",
          },
          system: 'urn:oid:2.16.840.1.113883.4.3.25',
          value: 'S99985931',
        },
      ],
      birthDate: '1948-07-01',
      name: [
        {
          family: 'Smith',
          given: ['John'],
        },
      ],
      gender: 'male',
    });

    // Create a new Patient with a matching single identifier
    const patient2: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'SS',
                display: 'Social Security Number',
              },
            ],
            text: 'Social Security Number',
          },
          system: 'http://hl7.org/fhir/sid/us-ssn',
          value: '999-47-5984',
        },
      ],
      birthDate: '1948-07-01',
      name: [
        {
          family: 'Smith',
          given: ['John'],
        },
      ],
      gender: 'male',
    });

    const contentType = 'application/fhir+json';

    await handler(medplum, { input: patient2, contentType, secrets: {} });
    const riskAssessment = await medplum.searchResources('RiskAssessment');
    expect(riskAssessment.length).toBe(1);
    expect(riskAssessment[0].subject?.reference).toBe('Patient/' + patient2.id);
  });
});

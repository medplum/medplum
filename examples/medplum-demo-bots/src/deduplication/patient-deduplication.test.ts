import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
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

  test('Success', async () => {
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
    });

    const contentType = 'application/fhir+json';

    await handler(medplum, { input: patient2, contentType, secrets: {} });

    const mergedPatient = await medplum.readResource('Patient', patient1.id as string);
    expect(mergedPatient.link?.[0].type).toBe('replaces');
  });

  // This test demonstrates flagging a patient if it is created with an identifier that matches an existing patient
  test('Warning', async () => {
    const medplum = new MockClient();
    // Create an original Patient
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
    });

    await medplum.createResource(patient1);

    // Create another patient with the same identifier but different name
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
      name: [
        {
          family: 'Smith',
          given: ['Jane'],
        },
      ],
    });

    const contentType = 'application/fhir+json';
    await handler(medplum, { input: patient2, contentType, secrets: {} });

    const updatedPatient = await medplum.readResource('Patient', patient2.id as string);

    expect(updatedPatient.active).toBe(true);
  });
});

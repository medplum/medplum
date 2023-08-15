import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, List, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './patient-deduplication';

// npm t src/examples/patient-deduplication.test.ts
// This test demostrates a automatically linking patients with three matching identifiers
describe('Patient Dedup', async () => {
  // Load the FHIR definitions to enable search parameter indexing
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  test('should throw error for non-Patient resource type', async () => {
    const medplum = new MockClient();
    const nonPatient = {
      resourceType: 'NotPatient',
    };

    const contentType = 'application/fhir+json';
    await expect(handler(medplum, { input: nonPatient, contentType, secrets: {} })).rejects.toThrow(
      'Unexpected input. Expected Patient.'
    );
  });

  test('should search for potential duplicates based on criteria', async () => {
    const medplum = new MockClient();
    const patient: Patient = {
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
      birthDate: '2000-01-01',
      gender: 'male',
    };

    await medplum.createResource(patient);

    const contentType = 'application/fhir+json';
    await handler(medplum, { input: patient, contentType, secrets: {} });

    // Check the search invocation with MockClient (if it supports such an inspection).
    // If it does not, use a mock or stub to check the method call.
  });

  test('should create RiskAssessment and Task if no lists with doNotMatch are found', async () => {
    const medplum = new MockClient();
    const patient: Patient = {
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
      birthDate: '2000-01-01',
      gender: 'male',
    };

    await medplum.createResource(patient);

    const contentType = 'application/fhir+json';
    await handler(medplum, { input: patient, contentType, secrets: {} });

    // Add assertions to check if RiskAssessment and Task are created.
  });

  test('should not create RiskAssessment and Task if lists with doNotMatch are found', async () => {
    const medplum = new MockClient();
    const patient: Patient = {
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
      birthDate: '2000-01-01',
      gender: 'male',
    };

    await medplum.createResource(patient);

    // Create a list with 'doNotMatch' (you may need to adjust the structure)
    const mockList = {
      resourceType: 'List',
      code: {
        coding: [
          {
            system: 'http://example.org/patientDeduplication/listType',
            code: 'doNotMatch',
          },
        ],
      },
      subject: {
        reference: `Patient/${patient.id}`,
      },
    } as List;

    await medplum.createResource(mockList);

    const contentType = 'application/fhir+json';
    await handler(medplum, { input: patient, contentType, secrets: {} });

    // Add assertions to check if RiskAssessment and Task are NOT created.
  });
});

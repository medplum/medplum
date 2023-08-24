import {
  ContentType,
  MedplumClient,
  createReference,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  resolveId,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, List, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './find-matching-patients';
import patientData from './patient-data.json';

interface TestContext {
  medplum: MedplumClient;
}

// npm t src/examples/patient-deduplication.test.ts
// This test demostrates a automatically linking patients with three matching identifiers
describe('Link Patient', async () => {
  // Load the FHIR definitions to enable search parameter indexing
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  // Load the sample data from patient-data.json
  beforeEach<TestContext>(async (context) => {
    context.medplum = new MockClient();
    await context.medplum.executeBatch(patientData as Bundle);
  });

  test<TestContext>('Created RiskAssessment', async ({ medplum }) => {
    // Read the patient
    const patients = await medplum.searchResources('Patient', { given: 'Alex' });

    await handler(medplum, { input: patients?.[0] as Patient, contentType: ContentType.FHIR_JSON, secrets: {} });

    // We expect two risk assessments to be created for the two candidate matches
    const riskAssessments = await medplum.searchResources('RiskAssessment');
    expect(riskAssessments.length).toBe(2);
    expect(riskAssessments.every((assessment) => resolveId(assessment.subject) === patients[0].id));
  });

  test<TestContext>('Does not create RiskAssessment due to doNotMatch List', async ({ medplum }) => {
    // Read two patients that should not be matched
    const alexSmith = await medplum.searchOne('Patient', { given: 'Alex', gender: 'male' });
    const alexisSmith = await medplum.searchOne('Patient', { given: 'Alex', gender: 'female' });

    if (!alexSmith || !alexisSmith) {
      throw new Error('Missing Input Patient');
    }

    // Add each patient to the other's
    const doNotMatchAlex = (await medplum.searchOne('List', { subject: getReferenceString(alexSmith) })) as List;
    const doNotMatchAlexis = (await medplum.searchOne('List', { subject: getReferenceString(alexisSmith) })) as List;
    doNotMatchAlex.entry = [{ item: createReference(alexisSmith) }];
    doNotMatchAlexis.entry = [{ item: createReference(alexSmith) }];
    await medplum.updateResource(doNotMatchAlex);
    await medplum.updateResource(doNotMatchAlexis);

    await handler(medplum, { input: alexSmith, contentType: ContentType.FHIR_JSON, secrets: {} });

    const riskAssessment = await medplum.searchResources('RiskAssessment');
    expect(riskAssessment.length).toBe(1);
    expect(riskAssessment?.[0]?.subject?.reference).toBe(getReferenceString(alexSmith));
    expect(riskAssessment?.[0]?.basis?.[0]).not.toBe(getReferenceString(alexisSmith));
  });
});

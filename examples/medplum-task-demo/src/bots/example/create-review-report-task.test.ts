import { getReferenceString, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, DiagnosticReport, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './create-review-report-task';

describe('Create Review Report Task', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters-medplum.json') as Bundle<SearchParameter>);
  });

  test('Success', async () => {
    const medplum = new MockClient();

    const diagnosticReport: DiagnosticReport = await medplum.createResource({
      resourceType: 'DiagnosticReport',
      status: 'preliminary',
      code: {
        coding: [
          {
            system: 'https://samplelab.com/testpanels',
            code: 'A1C_ONLY',
          },
        ],
      },
    });

    const contentType = 'appliation/fhir+json';
    await handler(medplum, { input: diagnosticReport, contentType, secrets: {} });

    const checkTask = await medplum.searchResources('Task', `focus=${getReferenceString(diagnosticReport)}`);
    expect(checkTask?.[0]?.code?.text).toBe('Review Diagnostic Report');
  });

  test('Report is not preliminary', async () => {
    const medplum = new MockClient();

    const diagnosticReport: DiagnosticReport = await medplum.createResource({
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: {
        coding: [
          {
            system: 'https://samplelab.com/testpanels',
            code: 'A1C_ONLY',
          },
        ],
      },
    });

    const contentType = 'appliation/fhir+json';
    await expect(handler(medplum, { input: diagnosticReport, contentType, secrets: {} })).rejects.toThrow(
      'Unexpected input. DiagnosticReport not in preliminary status'
    );
  });
});

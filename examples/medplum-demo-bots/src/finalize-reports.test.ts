import {
  LOINC,
  UCUM,
  createReference,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
// start-block definitions-import
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
// end-block definitions-import
import { Bundle, DiagnosticReport, Observation, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './finalize-report';

describe('Finalize Report', async () => {
  // start-block index-schema
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });
  // end-block index-schema

  test('Success', async () => {
    // start-block create-client
    const medplum = new MockClient();
    // end-block create-client

    // start-block create-resources
    //Create the Patient
    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [
        {
          family: 'Smith',
          given: ['John'],
        },
      ],
    });

    // Create an observation
    const observation: Observation = await medplum.createResource({
      resourceType: 'Observation',
      status: 'preliminary',
      subject: createReference(patient),
      code: {
        coding: [
          {
            system: LOINC,
            code: '39156-5',
            display: 'Body Mass Index',
          },
        ],
        text: 'Body Mass Index',
      },
      valueQuantity: {
        value: 24.5,
        unit: 'kg/m2',
        system: UCUM,
        code: 'kg/m2',
      },
    });

    // Create the Report
    const report: DiagnosticReport = await medplum.createResource({
      resourceType: 'DiagnosticReport',
      status: 'preliminary',
      code: { text: 'Body Mass Index' },
      result: [createReference(observation)],
    });
    // end-block create-resources

    // start-block invoke-bot
    // Invoke the Bot
    const contentType = 'application/fhir+json';
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: report,
      contentType,
      secrets: {},
    });
    // end-block invoke-bot

    // start-block query-results
    // Check the output by reading from the 'server'
    // We re-read the report from the 'server' because it may have been modified by the Bot
    const checkReport = await medplum.readResource('DiagnosticReport', report.id as string);
    expect(checkReport.status).toBe('final');

    // Read all the Observations referenced by the modified report
    if (checkReport.result) {
      for (const observationRef of checkReport.result) {
        const checkObservation = await medplum.readReference(observationRef);
        expect(checkObservation.status).toBe('final');
      }
    }
    // end-block query-results
  });

  test('Is Idempotent', async () => {
    const medplum = new MockClient();
    //Create the data
    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [
        {
          family: 'Smith',
          given: ['John'],
        },
      ],
    });

    const observation: Observation = await medplum.createResource({
      resourceType: 'Observation',
      status: 'preliminary',
      subject: createReference(patient),
      code: {
        coding: [
          {
            system: LOINC,
            code: '39156-5',
            display: 'Body Mass Index',
          },
        ],
        text: 'Body Mass Index',
      },
      valueQuantity: {
        value: 24.5,
        unit: 'kg/m2',
        system: UCUM,
        code: 'kg/m2',
      },
    });

    const report: DiagnosticReport = await medplum.createResource({
      resourceType: 'DiagnosticReport',
      status: 'preliminary',
      code: { text: 'Body Mass Index' },
      result: [createReference(observation)],
    });

    // start-block test-idempotent
    // Invoke the Bot for the first time
    const contentType = 'application/fhir+json';
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: report,
      contentType,
      secrets: {},
    });

    // Read back the report
    const updatedReport = await medplum.readResource('DiagnosticReport', report.id as string);

    // Create "spys" to catch calls that modify resources
    const updateResourceSpy = vi.spyOn(medplum, 'updateResource');
    const createResourceSpy = vi.spyOn(medplum, 'createResource');
    const patchResourceSpy = vi.spyOn(medplum, 'patchResource');

    // Invoke the bot a second time
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: updatedReport,
      contentType,
      secrets: {},
    });

    // Ensure that no modification methods were called
    expect(updateResourceSpy).not.toHaveBeenCalled();
    expect(createResourceSpy).not.toHaveBeenCalled();
    expect(patchResourceSpy).not.toHaveBeenCalled();
    // end-block test-idempotent
  });
});

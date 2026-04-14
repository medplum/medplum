// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, DiagnosticReport, Provenance, SearchParameter, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './finalize-parsed-report-bot';

describe('Finalize Parsed Report Bot', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('Promotes contained Observations and finalizes report', async () => {
    const medplum = new MockClient();

    // Create a preliminary DiagnosticReport with contained Observations
    const report: DiagnosticReport = await medplum.createResource({
      resourceType: 'DiagnosticReport',
      status: 'preliminary',
      code: { text: 'Laboratory Report' },
      subject: { reference: 'Patient/123' },
      contained: [
        {
          resourceType: 'Observation',
          id: 'obs-0',
          status: 'preliminary',
          code: { text: 'Glucose' },
          valueQuantity: { value: 95, unit: 'mg/dL' },
        },
        {
          resourceType: 'Observation',
          id: 'obs-1',
          status: 'preliminary',
          code: { text: 'HbA1c' },
          valueQuantity: { value: 5.7, unit: '%' },
        },
      ],
      result: [
        { reference: '#obs-0', display: 'Glucose' },
        { reference: '#obs-1', display: 'HbA1c' },
      ],
    });

    // Create Provenance for the report
    await medplum.createResource<Provenance>({
      resourceType: 'Provenance',
      target: [createReference(report)],
      recorded: new Date().toISOString(),
      agent: [
        {
          who: { reference: 'Bot/parse-bot' },
        },
      ],
    });

    // Create a completed review Task
    const task: Task = await medplum.createResource({
      resourceType: 'Task',
      status: 'completed',
      intent: 'order',
      code: {
        coding: [
          {
            system: 'http://medplum.com/fhir/CodeSystem/task-type',
            code: 'review-parsed-report',
          },
        ],
      },
      focus: createReference(report),
      owner: { reference: 'Practitioner/reviewer-1', display: 'Dr. Reviewer' },
    });

    const result = await handler(medplum, {
      bot: { reference: 'Bot/finalize-bot' },
      input: task,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    // Verify the report was finalized
    expect(result.resourceType).toBe('DiagnosticReport');
    expect(result.status).toBe('final');

    // Verify contained resources were removed (in the transaction, they get promoted)
    // The MockClient's executeBatch processes the transaction
    const finalReport = await medplum.readResource('DiagnosticReport', report.id!);
    expect(finalReport.status).toBe('final');
  });

  test('Throws on non-completed Task', async () => {
    const medplum = new MockClient();

    const task: Task = await medplum.createResource({
      resourceType: 'Task',
      status: 'in-progress',
      intent: 'order',
      code: {
        coding: [
          {
            system: 'http://medplum.com/fhir/CodeSystem/task-type',
            code: 'review-parsed-report',
          },
        ],
      },
    });

    await expect(
      handler(medplum, {
        bot: { reference: 'Bot/finalize-bot' },
        input: task,
        contentType: 'application/fhir+json',
        secrets: {},
      })
    ).rejects.toThrow('Expected Task with status=completed');
  });

  test('Throws on wrong task code', async () => {
    const medplum = new MockClient();

    const task: Task = await medplum.createResource({
      resourceType: 'Task',
      status: 'completed',
      intent: 'order',
      code: {
        coding: [
          {
            system: 'http://medplum.com/fhir/CodeSystem/task-type',
            code: 'wrong-code',
          },
        ],
      },
    });

    await expect(
      handler(medplum, {
        bot: { reference: 'Bot/finalize-bot' },
        input: task,
        contentType: 'application/fhir+json',
        secrets: {},
      })
    ).rejects.toThrow('Unexpected task code: wrong-code');
  });

  test('Throws on Task without focus', async () => {
    const medplum = new MockClient();

    const task: Task = await medplum.createResource({
      resourceType: 'Task',
      status: 'completed',
      intent: 'order',
      code: {
        coding: [
          {
            system: 'http://medplum.com/fhir/CodeSystem/task-type',
            code: 'review-parsed-report',
          },
        ],
      },
    });

    await expect(
      handler(medplum, {
        bot: { reference: 'Bot/finalize-bot' },
        input: task,
        contentType: 'application/fhir+json',
        secrets: {},
      })
    ).rejects.toThrow('Task has no focus reference');
  });
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, DiagnosticReport, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { NEEDS_CODE_ASSIGNMENT_TAG, SUGGESTED_CODING_EXTENSION_URL } from './code-mapping';
import { handler } from './create-review-task-bot';

describe('Create Review Task Bot', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('Creates review task for preliminary report', async () => {
    const medplum = new MockClient();

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
        },
        {
          resourceType: 'Observation',
          id: 'obs-1',
          status: 'preliminary',
          code: { text: 'HbA1c' },
        },
      ],
      result: [
        { reference: '#obs-0', display: 'Glucose' },
        { reference: '#obs-1', display: 'HbA1c' },
      ],
      extension: [
        {
          url: 'http://medplum.com/fhir/StructureDefinition/parsed-data-binary',
          valueReference: { reference: 'Binary/parsed-json-123' },
        },
        {
          url: 'http://medplum.com/fhir/StructureDefinition/parsing-provider',
          valueString: 'reducto',
        },
      ],
    });

    const task = await handler(medplum, {
      bot: { reference: 'Bot/review-task-bot' },
      input: report,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(task.resourceType).toBe('Task');
    expect(task.status).toBe('ready');
    expect(task.code?.coding?.[0]?.code).toBe('review-parsed-report');
    expect(task.focus?.reference).toBe(getReferenceString(report));
    expect(task.for?.reference).toBe('Patient/123');

    // Verify task inputs
    const parsedDataInput = task.input?.find((i) => i.type?.text === 'parsedData');
    expect(parsedDataInput?.valueReference?.reference).toBe('Binary/parsed-json-123');

    const providerInput = task.input?.find((i) => i.type?.text === 'parsingProvider');
    expect(providerInput?.valueString).toBe('reducto');

    const resultCountInput = task.input?.find((i) => i.type?.text === 'resultCount');
    expect(resultCountInput?.valueInteger).toBe(2);

    // Verify performer type
    expect(task.performerType?.[0]?.coding?.[0]?.code).toBe('158965000');

    // No unmapped observations in this report → no code-assignment inputs, routine priority
    expect(task.priority).toBe('routine');
    const codeAssignmentInputs = task.input?.filter((i) =>
      i.type?.coding?.some((c) => c.code === 'code-assignment-request')
    );
    expect(codeAssignmentInputs).toHaveLength(0);

    const unmappedCountInput = task.input?.find((i) => i.type?.text === 'unmappedCount');
    expect(unmappedCountInput?.valueInteger).toBe(0);
  });

  test('Surfaces unmapped observations as code-assignment-request inputs', async () => {
    const medplum = new MockClient();

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
          code: { text: 'Glucose', coding: [{ system: 'http://loinc.org', code: '2345-7' }] },
        },
        {
          resourceType: 'Observation',
          id: 'obs-1',
          status: 'preliminary',
          code: { text: 'Custom Assay XYZ' },
          meta: { tag: [NEEDS_CODE_ASSIGNMENT_TAG] },
          extension: [
            {
              url: SUGGESTED_CODING_EXTENSION_URL,
              valueCoding: {
                system: 'http://loinc.org',
                code: '99999-0',
                display: 'Custom Assay XYZ',
              },
            },
          ],
        },
        {
          resourceType: 'Observation',
          id: 'obs-2',
          status: 'preliminary',
          code: { text: 'Another Unknown Test' },
          meta: { tag: [NEEDS_CODE_ASSIGNMENT_TAG] },
        },
      ],
      result: [
        { reference: '#obs-0', display: 'Glucose' },
        { reference: '#obs-1', display: 'Custom Assay XYZ' },
        { reference: '#obs-2', display: 'Another Unknown Test' },
      ],
    });

    const task = await handler(medplum, {
      bot: { reference: 'Bot/review-task-bot' },
      input: report,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    // Priority elevated due to unmapped tests
    expect(task.priority).toBe('urgent');

    const unmappedCountInput = task.input?.find((i) => i.type?.text === 'unmappedCount');
    expect(unmappedCountInput?.valueInteger).toBe(2);

    const codeAssignmentInputs = task.input?.filter((i) =>
      i.type?.coding?.some((c) => c.code === 'code-assignment-request')
    );
    expect(codeAssignmentInputs).toHaveLength(2);

    const xyzInput = codeAssignmentInputs?.find((i) => i.type?.text === 'Custom Assay XYZ');
    expect(xyzInput?.valueString).toBe('Custom Assay XYZ');
    const suggestion = xyzInput?.extension?.find((e) => e.url === SUGGESTED_CODING_EXTENSION_URL);
    expect(suggestion?.valueCoding?.code).toBe('99999-0');

    const unknownInput = codeAssignmentInputs?.find((i) => i.type?.text === 'Another Unknown Test');
    expect(unknownInput?.valueString).toBe('Another Unknown Test');
    // No LLM suggestion for this one
    expect(unknownInput?.extension).toBeUndefined();
  });

  test('Throws on non-preliminary report', async () => {
    const medplum = new MockClient();

    const report: DiagnosticReport = await medplum.createResource({
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: { text: 'Laboratory Report' },
    });

    await expect(
      handler(medplum, {
        bot: { reference: 'Bot/review-task-bot' },
        input: report,
        contentType: 'application/fhir+json',
        secrets: {},
      })
    ).rejects.toThrow('Expected DiagnosticReport with status=preliminary');
  });
});

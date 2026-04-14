// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, DiagnosticReport, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
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

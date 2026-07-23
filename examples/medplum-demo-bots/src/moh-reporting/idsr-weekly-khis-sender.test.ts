// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, MeasureReport, Organization, SearchParameter, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import fetch from 'node-fetch';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { handler as khisSenderHandler } from './idsr-weekly-khis-sender';
import {
  KENYA_IDSR_TASK_CODE_SYSTEM,
  KENYA_IDSR_WEEKLY_MEASURE_URL,
  KENYA_IDSR_WEEKLY_REVIEW_TASK_CODE,
} from './kenya-idsr';

vi.mock('node-fetch', () => ({
  default: vi.fn(() => ({ ok: true, status: 200, statusText: 'OK' })),
}));

describe('Kenya IDSR weekly KHIS sender', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('submits DHIS2 dataValueSet after weekly review completion', async () => {
    const { medplum, task } = await setupCompletedWeeklyReviewTask();

    const payload = await khisSenderHandler(medplum, {
      bot: { reference: 'Bot/123' },
      input: task,
      contentType: 'application/fhir+json',
      secrets: khisSecrets(),
    });

    expect(payload).toMatchObject({ dataSet: 'khis-data-set', orgUnit: 'khis-org-unit', period: '2026W29' });
    expect(payload?.dataValues).toEqual(
      expect.arrayContaining([
        { dataElement: 'de-malaria', categoryOptionCombo: undefined, value: '4', comment: 'Malaria' },
        { dataElement: 'de-typhoid', categoryOptionCombo: undefined, value: '0', comment: 'Typhoid fever' },
      ])
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://khis.example.org/api/dataValueSets',
      expect.objectContaining({ method: 'POST' })
    );
    const communication = await medplum.searchOne('Communication', { subject: task.for?.reference });
    expect(communication).toMatchObject({ resourceType: 'Communication', status: 'completed' });
  });

  test('does not submit before review completion', async () => {
    const { medplum, task } = await setupCompletedWeeklyReviewTask('ready');

    const payload = await khisSenderHandler(medplum, {
      bot: { reference: 'Bot/123' },
      input: task,
      contentType: 'application/fhir+json',
      secrets: khisSecrets(),
    });

    expect(payload).toBeUndefined();
  });
});

async function setupCompletedWeeklyReviewTask(
  status: Task['status'] = 'completed'
): Promise<{ medplum: MockClient; task: Task }> {
  const medplum = new MockClient();
  const facility = await medplum.createResource<Organization>({ resourceType: 'Organization', name: 'Test Facility' });
  const measureReport = await medplum.createResource<MeasureReport>({
    resourceType: 'MeasureReport',
    status: 'complete',
    type: 'summary',
    measure: KENYA_IDSR_WEEKLY_MEASURE_URL,
    subject: createReference(facility),
    reporter: createReference(facility),
    period: { start: '2026-07-13T00:00:00.000Z', end: '2026-07-20T00:00:00.000Z' },
    group: [
      { code: { coding: [{ code: 'MALARIA', display: 'Malaria' }], text: 'Malaria' }, population: [{ count: 4 }] },
      {
        code: { coding: [{ code: 'TYPHOID', display: 'Typhoid fever' }], text: 'Typhoid fever' },
        population: [{ count: 0 }],
      },
    ],
  });
  const task = await medplum.createResource<Task>({
    resourceType: 'Task',
    status,
    intent: 'order',
    code: {
      coding: [
        {
          system: KENYA_IDSR_TASK_CODE_SYSTEM,
          code: KENYA_IDSR_WEEKLY_REVIEW_TASK_CODE,
          display: 'IDSR weekly report review',
        },
      ],
    },
    focus: createReference(measureReport),
    for: createReference(facility),
  });
  return { medplum, task };
}

function khisSecrets(): Record<string, { name: string; valueString: string }> {
  return {
    KHIS_BASE_URL: { name: 'KHIS_BASE_URL', valueString: 'https://khis.example.org' },
    KHIS_USERNAME: { name: 'KHIS_USERNAME', valueString: 'user' },
    KHIS_PASSWORD: { name: 'KHIS_PASSWORD', valueString: 'pass' },
    KHIS_ORG_UNIT: { name: 'KHIS_ORG_UNIT', valueString: 'khis-org-unit' },
    KHIS_DATA_SET: { name: 'KHIS_DATA_SET', valueString: 'khis-data-set' },
    KHIS_PERIOD: { name: 'KHIS_PERIOD', valueString: '2026W29' },
    KHIS_DATA_ELEMENT_MAP: {
      name: 'KHIS_DATA_ELEMENT_MAP',
      valueString: '{"MALARIA":"de-malaria","TYPHOID":"de-typhoid"}',
    },
  };
}

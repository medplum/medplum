// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, MeasureReport, Organization, SearchParameter, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import fetch from 'node-fetch';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { handler as routineKhisSenderHandler } from './idsr-routine-khis-sender';
import {
  KENYA_IDSR_ROUTINE_MEASURE_URL,
  KENYA_IDSR_ROUTINE_REVIEW_TASK_CODE,
  KENYA_IDSR_TASK_CODE_SYSTEM,
} from './kenya-idsr';

vi.mock('node-fetch', () => ({
  default: vi.fn(() => ({ ok: true, status: 200, statusText: 'OK' })),
}));

describe('Kenya IDSR routine KHIS sender', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('submits a routine DHIS2 dataValueSet after review completion', async () => {
    const { medplum, task } = await setupCompletedRoutineReviewTask();

    const payload = await routineKhisSenderHandler(medplum, {
      bot: { reference: 'Bot/123' },
      input: task,
      contentType: 'application/fhir+json',
      secrets: khisSecrets(),
    });

    expect(payload).toMatchObject({ dataSet: 'khis-routine-data-set', orgUnit: 'khis-org-unit', period: '2026Q2' });
    expect(payload?.dataValues).toEqual(
      expect.arrayContaining([
        { dataElement: 'de-malaria', categoryOptionCombo: undefined, value: '12', comment: 'Malaria' },
      ])
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://khis.example.org/api/dataValueSets',
      expect.objectContaining({ method: 'POST' })
    );
    expect(await medplum.searchOne('Communication', { subject: task.for?.reference })).toMatchObject({
      resourceType: 'Communication',
      status: 'completed',
    });
  });
});

async function setupCompletedRoutineReviewTask(): Promise<{ medplum: MockClient; task: Task }> {
  const medplum = new MockClient();
  const facility = await medplum.createResource<Organization>({
    resourceType: 'Organization',
    name: 'Routine Facility',
  });
  const measureReport = await medplum.createResource<MeasureReport>({
    resourceType: 'MeasureReport',
    status: 'complete',
    type: 'summary',
    measure: KENYA_IDSR_ROUTINE_MEASURE_URL,
    subject: createReference(facility),
    reporter: createReference(facility),
    period: { start: '2026-04-01T00:00:00.000Z', end: '2026-07-01T00:00:00.000Z' },
    group: [
      { code: { coding: [{ code: 'MALARIA', display: 'Malaria' }], text: 'Malaria' }, population: [{ count: 12 }] },
    ],
  });
  const task = await medplum.createResource<Task>({
    resourceType: 'Task',
    status: 'completed',
    intent: 'order',
    code: {
      coding: [
        {
          system: KENYA_IDSR_TASK_CODE_SYSTEM,
          code: KENYA_IDSR_ROUTINE_REVIEW_TASK_CODE,
          display: 'IDSR routine report review',
        },
      ],
    },
    focus: createReference(measureReport),
    for: createReference(facility),
    input: [{ type: { text: 'DHIS2 period' }, valueString: '2026Q2' }],
  });
  return { medplum, task };
}

function khisSecrets(): Record<string, { name: string; valueString: string }> {
  return {
    KHIS_BASE_URL: { name: 'KHIS_BASE_URL', valueString: 'https://khis.example.org' },
    KHIS_USERNAME: { name: 'KHIS_USERNAME', valueString: 'user' },
    KHIS_PASSWORD: { name: 'KHIS_PASSWORD', valueString: 'pass' },
    KHIS_ORG_UNIT: { name: 'KHIS_ORG_UNIT', valueString: 'khis-org-unit' },
    KHIS_DATA_SET: { name: 'KHIS_DATA_SET', valueString: 'khis-routine-data-set' },
    KHIS_DATA_ELEMENT_MAP: { name: 'KHIS_DATA_ELEMENT_MAP', valueString: '{"MALARIA":"de-malaria"}' },
  };
}

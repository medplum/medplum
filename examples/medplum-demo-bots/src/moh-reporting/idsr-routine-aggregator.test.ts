// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, Observation, Organization, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeAll, describe, expect, test } from 'vitest';
import { aggregateRoutineReport } from './idsr-routine-aggregator';
import { KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL } from './kenya-idsr';

describe('Kenya IDSR routine aggregator', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('creates a monthly MeasureReport with zero-count rows and a review Task', async () => {
    const medplum = new MockClient();
    const facility = await medplum.createResource<Organization>({
      resourceType: 'Organization',
      name: 'Routine Facility',
    });
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(facility),
      code: { coding: [{ system: KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL, code: 'MALARIA', display: 'Malaria' }] },
      valueString: 'Positive',
      issued: '2026-06-10T08:00:00.000Z',
    });

    const measureReport = await aggregateRoutineReport(
      medplum,
      { bot: { reference: 'Bot/123' }, input: {}, contentType: 'application/fhir+json', secrets: {} },
      'monthly',
      new Date('2026-07-22T12:00:00Z')
    );

    const malariaGroup = measureReport?.group?.find((group) => group.code?.coding?.[0]?.code === 'MALARIA');
    const typhoidGroup = measureReport?.group?.find((group) => group.code?.coding?.[0]?.code === 'TYPHOID');
    expect(measureReport?.measure).toContain('kenya-idsr-routine');
    expect(malariaGroup?.population?.[0]?.count).toBe(1);
    expect(typhoidGroup?.population?.[0]?.count).toBe(0);
    expect(await medplum.searchOne('Task', { for: createReference(facility).reference })).toMatchObject({
      resourceType: 'Task',
      status: 'ready',
    });
  });
});

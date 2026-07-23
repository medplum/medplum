// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, MeasureReport, Observation, Organization, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { getPreviousEpiWeek } from './epi-week';
import { handler as weeklyAggregatorHandler } from './idsr-weekly-aggregator';
import { KENYA_IDSR_IDENTIFIER_SYSTEM, KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL } from './kenya-idsr';

describe('Kenya IDSR weekly aggregator', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('creates a weekly MeasureReport and review Task including zero-count rows', async () => {
    const medplum = new MockClient();
    const facility = await medplum.createResource<Organization>({
      resourceType: 'Organization',
      name: 'Test Facility',
    });
    const epiWeek = getPreviousEpiWeek(new Date());
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(facility),
      code: { coding: [{ system: KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL, code: 'MALARIA', display: 'Malaria' }] },
      valueString: 'Positive',
      issued: epiWeek.start,
    });

    const measureReport = await weeklyAggregatorHandler(medplum, {
      bot: { reference: 'Bot/123' },
      input: {},
      contentType: 'application/fhir+json',
      secrets: {},
    });

    const malariaGroup = measureReport?.group?.find((group) => group.code?.coding?.[0]?.code === 'MALARIA');
    const typhoidGroup = measureReport?.group?.find((group) => group.code?.coding?.[0]?.code === 'TYPHOID');
    expect(malariaGroup?.population?.[0]?.count).toBe(1);
    expect(typhoidGroup?.population?.[0]?.count).toBe(0);

    const task = await medplum.searchOne('Task', { for: createReference(facility).reference });
    expect(task).toMatchObject({ resourceType: 'Task', status: 'ready', priority: 'urgent' });
  });

  test('is idempotent for the same facility and epi week', async () => {
    const medplum = new MockClient();
    const facility = await medplum.createResource<Organization>({
      resourceType: 'Organization',
      name: 'Test Facility',
    });
    await weeklyAggregatorHandler(medplum, {
      bot: { reference: 'Bot/123' },
      input: {},
      contentType: 'application/fhir+json',
      secrets: { IDSR_FACILITY_ORGANIZATION_ID: { name: 'IDSR_FACILITY_ORGANIZATION_ID', valueString: facility.id } },
    });

    const createResourceSpy = vi.spyOn(medplum, 'createResource');
    const secondResult = await weeklyAggregatorHandler(medplum, {
      bot: { reference: 'Bot/123' },
      input: {},
      contentType: 'application/fhir+json',
      secrets: { IDSR_FACILITY_ORGANIZATION_ID: { name: 'IDSR_FACILITY_ORGANIZATION_ID', valueString: facility.id } },
    });

    expect((secondResult as MeasureReport).identifier?.[0]?.system).toBe(KENYA_IDSR_IDENTIFIER_SYSTEM);
    expect(createResourceSpy).not.toHaveBeenCalled();
  });
});

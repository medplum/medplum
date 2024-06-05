import { ContentType, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { Bot, Bundle, CoverageEligibilityRequest, Reference, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import {
  generalBenefitsCheck,
  otherEligibilityCheck,
  requestData,
  requestWithNoCoverage,
} from '../../data/example/bot-testing-data';
import { handler } from './process-eligibility-request';

describe('Process Eligibility Request', async () => {
  const bot: Reference<Bot> = { reference: 'Bot/123' };
  const contentType = ContentType.FHIR_JSON;
  const secrets = {};

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('Success', async () => {
    const medplum = new MockClient();
    await medplum.executeBatch(requestData);

    const input = (await medplum.searchOne('CoverageEligibilityRequest')) as CoverageEligibilityRequest;

    await handler(medplum, { bot, input, contentType, secrets });

    const checkForResponse = await medplum.searchOne('CoverageEligibilityResponse');
    expect(checkForResponse).toBeDefined();
    expect(checkForResponse?.resourceType).toBe('CoverageEligibilityResponse');
  });

  test('No Coverage', async () => {
    const medplum = new MockClient();
    console.log = vi.fn();
    await medplum.executeBatch(requestWithNoCoverage);

    const input = (await medplum.searchOne('CoverageEligibilityRequest')) as CoverageEligibilityRequest;

    await expect(handler(medplum, { bot, input, contentType, secrets })).rejects.toThrow(/Invalid request submitted/);
    expect(console.log).toHaveBeenCalledWith('This request has no linked coverage');
  });

  test('General Benefit Check, eligible', async () => {
    const medplum = new MockClient();
    await medplum.executeBatch(generalBenefitsCheck);

    const input = (await medplum.searchOne('CoverageEligibilityRequest')) as CoverageEligibilityRequest;

    await handler(medplum, { bot, input, contentType, secrets });

    const response = await medplum.searchOne('CoverageEligibilityResponse');

    expect(response).toBeDefined();
    expect(response?.insurance?.[0].item?.[0].excluded).toEqual(true);
  });

  test('Non-eligible request', async () => {
    const medplum = new MockClient();
    await medplum.executeBatch(otherEligibilityCheck);

    const input = (await medplum.searchOne('CoverageEligibilityRequest')) as CoverageEligibilityRequest;

    await handler(medplum, { bot, input, contentType, secrets });

    const response = await medplum.searchOne('CoverageEligibilityResponse');
    expect(response).toBeDefined();
    expect(response?.insurance?.[0].item?.[0].excluded).toEqual(false);
  });
});

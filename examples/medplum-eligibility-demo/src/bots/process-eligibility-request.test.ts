import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { Bundle, CoverageEligibilityRequest, SearchParameter } from '@medplum/fhirtypes';
import { readJson } from '@medplum/definitions';
import { MockClient } from '@medplum/mock';
import {
  generalBenefitsCheck,
  otherEligibilityCheck,
  requestData,
  requestWithNoCoverage,
} from '../../data/example/bot-testing-data';
import { handler } from './process-eligibility-request';
import { describe, beforeAll, test, expect, vi } from 'vitest';

describe('Process Eligibility Request', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters-medplum.json') as Bundle<SearchParameter>);
  });

  test('Success', async () => {
    const medplum = new MockClient();
    await medplum.executeBatch(requestData);

    const request = (await medplum.searchOne('CoverageEligibilityRequest')) as CoverageEligibilityRequest;

    const contentType = 'application/fhir+json';
    await handler(medplum, { input: request, contentType, secrets: {} });

    const checkForResponse = await medplum.searchOne('CoverageEligibilityResponse');
    expect(checkForResponse).toBeDefined();
    expect(checkForResponse?.resourceType).toBe('CoverageEligibilityResponse');
  });

  test('No Coverage', async () => {
    const medplum = new MockClient();
    console.log = vi.fn();
    await medplum.executeBatch(requestWithNoCoverage);

    const request = (await medplum.searchOne('CoverageEligibilityRequest')) as CoverageEligibilityRequest;

    const contentType = 'application/fhir+json';
    await handler(medplum, { input: request, contentType, secrets: {} });

    expect(console.log).toHaveBeenCalledWith('This request has no linked coverage');
  });

  test('General Benefit Check, eligible', async () => {
    const medplum = new MockClient();
    await medplum.executeBatch(generalBenefitsCheck);

    const request = (await medplum.searchOne('CoverageEligibilityRequest')) as CoverageEligibilityRequest;

    const contentType = 'application/fhir+json';
    await handler(medplum, { input: request, contentType, secrets: {} });

    const response = await medplum.searchOne('CoverageEligibilityResponse');

    expect(response).toBeDefined();
    expect(response?.insurance?.[0].item?.[0].excluded).toEqual(true);
  });

  test('Non-eligibel request', async () => {
    const medplum = new MockClient();
    await medplum.executeBatch(otherEligibilityCheck);

    const request = (await medplum.searchOne('CoverageEligibilityRequest')) as CoverageEligibilityRequest;

    const contentType = 'application/fhir+json';
    await handler(medplum, { input: request, contentType, secrets: {} });

    const response = await medplum.searchOne('CoverageEligibilityResponse');
    expect(response).toBeDefined();
    expect(response?.insurance?.[0].item?.[0].excluded).toEqual(false);
  });
});

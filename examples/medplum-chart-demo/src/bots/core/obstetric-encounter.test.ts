import { getReferenceString, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { MockClient } from '@medplum/mock';
import {
  encounter,
  fullResponse,
  noCondition,
  oneBloodPressureMeasurement,
  onlyCondition,
  responseWithNoAssessment,
} from './test-data/obstetric-encounter-note-test-data';
import { handler } from './obstetric-encounter-note';
import { vi } from 'vitest';

describe('Obstetric Encounter Note', async () => {
  const bot = { reference: 'Bot/123' };
  const contentType = 'application/fhir+json';

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('Full Response', async () => {
    const medplum = new MockClient();
    const testEncounter = await medplum.createResource(encounter);
    const encounterRef = getReferenceString(testEncounter);
    fullResponse.encounter = { reference: encounterRef };

    const responseBundle = await handler(medplum, { bot, input: fullResponse, contentType, secrets: {} });
    const observations = await medplum.searchResources('Observation', {
      encounter: encounterRef,
    });
    const conditions = await medplum.searchResources('Condition', {
      encounter: encounterRef,
    });
    const clinicalImpressions = await medplum.searchResources('ClinicalImpression');

    expect(responseBundle.entry?.length).toBe(12);
    expect(observations.length).toBe(9);
    expect(conditions.length).toBe(2);
    expect(clinicalImpressions.length).toBe(1);
  });

  test('No Assessment', async () => {
    const medplum = new MockClient();

    const testEncounter = await medplum.createResource(encounter);
    responseWithNoAssessment.encounter = { reference: getReferenceString(testEncounter) };

    const responseBundle = await handler(medplum, { bot, input: responseWithNoAssessment, contentType, secrets: {} });

    const clinicalImpression = await medplum.searchResources('ClinicalImpression');

    expect(responseBundle.entry?.length).toBe(11);
    expect(clinicalImpression.length).toBe(0);
  });

  test('No Condition', async () => {
    const medplum = new MockClient();

    const testEncounter = await medplum.createResource(encounter);
    noCondition.encounter = { reference: getReferenceString(testEncounter) };

    await expect(handler(medplum, { bot, input: noCondition, contentType, secrets: {} })).rejects.toThrow(
      /^Must provide a reason for the visit$/
    );
  });

  test('Only Condition', async () => {
    const medplum = new MockClient();

    const testEncounter = await medplum.createResource(encounter);
    onlyCondition.encounter = { reference: getReferenceString(testEncounter) };

    const responseBundle = await handler(medplum, { bot, input: onlyCondition, contentType, secrets: {} });

    const observations = await medplum.searchResources('Observation', {
      encounter: getReferenceString(encounter),
    });
    const clinicalImpressions = await medplum.searchResources('ClinicalImpression', {
      encounter: getReferenceString(encounter),
    });

    expect(responseBundle.entry?.length).toBe(1);
    expect(observations.length).toBe(0);
    expect(clinicalImpressions.length).toBe(0);
  });

  test('Only one blood pressure measurment', async () => {
    const medplum = new MockClient();
    const testEncounter = await medplum.createResource(encounter);
    const encounterRef = getReferenceString(testEncounter);
    oneBloodPressureMeasurement.encounter = { reference: encounterRef };

    const responseBundle = await handler(medplum, {
      bot,
      contentType,
      input: oneBloodPressureMeasurement,
      secrets: {},
    });
    const observations = await medplum.searchResources('Observation', {
      encounter: getReferenceString(testEncounter),
    });
    const clinicalImpression = await medplum.searchResources('ClinicalImpression');
    const conditions = await medplum.searchResources('Condition', {
      encounter: getReferenceString(testEncounter),
    });
    const bloodPressure = await medplum.searchResources('Observation', {
      code: '35094-2',
    });
    const components = bloodPressure[0].component;

    expect(responseBundle.entry?.length).toBe(12);
    expect(observations.length).toBe(9);
    expect(conditions.length).toBe(2);
    expect(clinicalImpression.length).toBe(1);
    expect(components?.length).toBe(1);
  });
});

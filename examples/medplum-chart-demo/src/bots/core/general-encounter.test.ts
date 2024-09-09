import { getReferenceString, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './general-encounter-note';
import {
  encounter,
  fullResponse,
  fullResponseNoProblemList,
  noReasonForVisit,
  oneBloodPressureMeasurement,
  onlyCondition,
  selfReportedHistoryBmi,
  selfReportedHistoryBreastCancer,
  selfReportedHistoryEndometrialCancer,
} from './test-data/general-encounter-test-data';
import { vi } from 'vitest';

describe('General Encounter Note', async () => {
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

  test('Full response with problem list', async () => {
    const medplum = new MockClient();
    const testEncounter = await medplum.createResource(encounter);
    const encounterRef = getReferenceString(testEncounter);
    fullResponse.encounter = { reference: encounterRef };

    const responseBundle = await handler(medplum, { bot, contentType, input: fullResponse, secrets: {} });
    const observations = await medplum.searchResources('Observation', {
      encounter: encounterRef,
    });
    const conditions = await medplum.searchResources('Condition', {
      encounter: encounterRef,
    });
    const clinicalImpressions = await medplum.searchResources('ClinicalImpression');

    expect(observations.length).toBe(9);
    expect(conditions.length).toBe(2);
    expect(clinicalImpressions.length).toBe(1);
    expect(responseBundle.entry?.length).toBe(12);
  });

  test('Full response, no problem list', async () => {
    const medplum = new MockClient();
    const testEncounter = await medplum.createResource(encounter);
    const encounterRef = getReferenceString(testEncounter);
    fullResponseNoProblemList.encounter = { reference: encounterRef };

    const responseBundle = await handler(medplum, { bot, contentType, input: fullResponseNoProblemList, secrets: {} });
    const observations = await medplum.searchResources('Observation', {
      encounter: encounterRef,
    });
    const conditions = await medplum.searchResources('Condition', {
      encounter: encounterRef,
    });
    const clinicalImpressions = await medplum.searchResources('ClinicalImpression');

    expect(observations.length).toBe(9);
    expect(conditions.length).toBe(1);
    expect(clinicalImpressions.length).toBe(1);
    expect(responseBundle.entry?.length).toBe(11);
  });

  test('No reason for visit', async () => {
    const medplum = new MockClient();
    const testEncounter = await medplum.createResource(encounter);
    const encounterRef = getReferenceString(testEncounter);
    noReasonForVisit.encounter = { reference: encounterRef };

    await expect(handler(medplum, { bot, contentType, input: noReasonForVisit, secrets: {} })).rejects.toThrow(
      /^Must provide a reason for the visit$/
    );
  });

  test('Only condition', async () => {
    const medplum = new MockClient();
    const testEncounter = await medplum.createResource(encounter);
    const encounterRef = getReferenceString(testEncounter);
    onlyCondition.encounter = { reference: encounterRef };

    const responseBundle = await handler(medplum, { bot, contentType, input: onlyCondition, secrets: {} });
    const observations = await medplum.searchResources('Observation', {
      encounter: getReferenceString(testEncounter),
    });
    const clinicalImpression = await medplum.searchResources('ClinicalImpression');
    const conditions = await medplum.searchResources('Condition', {
      encounter: getReferenceString(testEncounter),
    });

    expect(responseBundle.entry?.length).toBe(1);
    expect(observations.length).toBe(0);
    expect(conditions.length).toBe(1);
    expect(clinicalImpression.length).toBe(0);
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
    const clinicalImpressions = await medplum.searchResources('ClinicalImpression');
    const conditions = await medplum.searchResources('Condition', {
      encounter: getReferenceString(testEncounter),
    });
    const bloodPressure = await medplum.searchResources('Observation', {
      code: '35094-2',
    });
    const components = bloodPressure[0].component;

    expect(observations.length).toBe(9);
    expect(conditions.length).toBe(2);
    expect(clinicalImpressions.length).toBe(1);
    expect(responseBundle.entry?.length).toBe(12);
    expect(components?.length).toBe(1);
  });

  test('Self-reported history of BMI > 30', async () => {
    const medplum = new MockClient();
    const testEncounter = await medplum.createResource(encounter);
    const encounterRef = getReferenceString(testEncounter);
    selfReportedHistoryBmi.encounter = { reference: encounterRef };

    await handler(medplum, { bot, contentType, input: selfReportedHistoryBmi, secrets: {} });

    const highBmiObservation = await medplum.searchOne('Observation', {
      code: 'E66.9',
    });
    expect(highBmiObservation).toBeDefined();
    expect(highBmiObservation?.valueString).toBe('BMI > 30');
  });

  test('Self-reported breast cancer', async () => {
    const medplum = new MockClient();
    const testEncounter = await medplum.createResource(encounter);
    const encounterRef = getReferenceString(testEncounter);
    selfReportedHistoryBreastCancer.encounter = { reference: encounterRef };

    await handler(medplum, { bot, contentType, input: selfReportedHistoryBreastCancer, secrets: {} });

    const breastCancerObservatoin = await medplum.searchOne('Observation', {
      code: 'D05.10',
    });
    expect(breastCancerObservatoin).toBeDefined();
    expect(breastCancerObservatoin?.valueString).toBe('Breast cancer');
  });

  test('Self-reported endometrial cancer', async () => {
    const medplum = new MockClient();
    const testEncounter = await medplum.createResource(encounter);
    const encounterRef = getReferenceString(testEncounter);
    selfReportedHistoryEndometrialCancer.encounter = { reference: encounterRef };

    await handler(medplum, { bot, contentType, input: selfReportedHistoryEndometrialCancer, secrets: {} });

    const endometrialCancerObservatoin = await medplum.searchOne('Observation', {
      code: 'C54.1',
    });
    expect(endometrialCancerObservatoin).toBeDefined();
    expect(endometrialCancerObservatoin?.valueString).toBe('Endometrial cancer');
  });
});

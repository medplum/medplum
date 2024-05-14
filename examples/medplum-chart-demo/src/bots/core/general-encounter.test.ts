import { getReferenceString, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Quantity, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { calculateBMI, handler } from './general-encounter-note';
import {
  encounter,
  fullResponse,
  fullResponseNoProblemList,
  noReasonForVisit,
  oneBloodPressureMeasurement,
  onlyCondition,
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

    const responseBundle = await handler({ bot, contentType, input: fullResponse, secrets: {} }, medplum);
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

    const responseBundle = await handler({ bot, contentType, input: fullResponseNoProblemList, secrets: {} }, medplum);
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

    await expect(handler({ bot, contentType, input: noReasonForVisit, secrets: {} }, medplum)).rejects.toThrow(
      /^Must provide a reason for the visit$/
    );
  });

  test('Only condition', async () => {
    const medplum = new MockClient();
    const testEncounter = await medplum.createResource(encounter);
    const encounterRef = getReferenceString(testEncounter);
    onlyCondition.encounter = { reference: encounterRef };

    const responseBundle = await handler({ bot, contentType, input: onlyCondition, secrets: {} }, medplum);
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

    const responseBundle = await handler(
      { bot, contentType, input: oneBloodPressureMeasurement, secrets: {} },
      medplum
    );
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

  test('Calculate BMI', async () => {
    const weightKg: Quantity = { value: 50, unit: 'kg' };
    const heightIn: Quantity = { value: 70, unit: 'in' };
    const heightFt: Quantity = { value: 6, unit: 'ft' };
    const heightM: Quantity = { value: 1.8, unit: 'm' };

    const bmiFromInches = calculateBMI(heightIn, weightKg);
    const bmiFromFeet = calculateBMI(heightFt, weightKg);
    const bmiFromMeters = calculateBMI(heightM, weightKg);

    expect(bmiFromInches.value).toBe(15.8);
    expect(bmiFromFeet.value).toBe(14.9);
    expect(bmiFromMeters.value).toBe(15.4);
  });

  test('BMI with no height value', async () => {
    expect(() => calculateBMI({ unit: 'cm' }, { value: 60, unit: 'kg' })).toThrow(/^All values must be provided$/);
  });

  test('BMI with no weight value', async () => {
    expect(() => calculateBMI({ value: 180, unit: 'cm' }, { unit: 'kg' })).toThrow(/^All values must be provided$/);
  });

  test('BMI with no height unit', async () => {
    expect(() => calculateBMI({ value: 180 }, { value: 60, unit: 'kg' })).toThrow(/^No unit defined$/);
  });

  test('BMI with no weight unit', async () => {
    expect(() => calculateBMI({ value: 180, unit: 'cm' }, { value: 50 })).toThrow(/^No unit defined$/);
  });

  test('BMI with unknown height unit', async () => {
    expect(() => calculateBMI({ value: 180, unit: 'cms' }, { value: 50, unit: 'kg' })).toThrow(
      /^Unknown unit. Please provide height in one of the following units: Inches, feet, centimeters, or meters.$/
    );
  });

  test('BMI with unknown weight unit', async () => {
    expect(() => calculateBMI({ value: 180, unit: 'cm' }, { value: 50, unit: 'kgs' })).toThrow(
      /^Unknown unit. Please provide weight in one of the following units: Pounds or kilograms.$/
    );
  });
});

import { getReferenceString, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './gynecology-encounter-note';
import {
  encounter,
  fullResponse,
  fullResponseNoProblemList,
  noAssessment,
  oneBloodPressureMeasurement,
  noCondition,
  onlyCondition,
} from './test-data/gynecology-encounter-data';

describe('Gynecology Encounter Note', async () => {
  const bot = { reference: 'Bot/123' };
  const contentType = 'application/fhir+json';

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('Full Response with Problem List', async () => {
    const medplum = new MockClient();

    const testEncounter = await medplum.createResource(encounter);
    fullResponse.encounter = { reference: getReferenceString(testEncounter) };

    const responseBundle = await handler(medplum, { bot, input: fullResponse, contentType, secrets: {} });
    const clinicalImpression = await medplum.searchResources('ClinicalImpression');
    const observations = await medplum.searchResources('Observation', {
      encounter: getReferenceString(testEncounter),
    });
    const conditions = await medplum.searchResources('Condition', {
      encounter: getReferenceString(testEncounter),
    });

    expect(responseBundle.entry?.length).toBe(13);
    expect(clinicalImpression.length).toBe(1);
    expect(observations.length).toBe(10);
    expect(conditions.length).toBe(2);
  });

  test('Full Response without Problem List', async () => {
    const medplum = new MockClient();

    const testEncounter = await medplum.createResource(encounter);
    fullResponseNoProblemList.encounter = { reference: getReferenceString(testEncounter) };

    const responseBundle = await handler(medplum, { bot, input: fullResponseNoProblemList, contentType, secrets: {} });
    const clinicalImpression = await medplum.searchResources('ClinicalImpression');
    const observations = await medplum.searchResources('Observation', {
      encounter: getReferenceString(testEncounter),
    });
    const conditions = await medplum.searchResources('Condition', {
      encounter: getReferenceString(testEncounter),
    });

    expect(responseBundle.entry?.length).toBe(12);
    expect(clinicalImpression.length).toBe(1);
    expect(observations.length).toBe(10);
    expect(conditions.length).toBe(1);
  });

  test('No Assessment', async () => {
    const medplum = new MockClient();
    const testEncounter = await medplum.createResource(encounter);
    noAssessment.encounter = { reference: getReferenceString(testEncounter) };

    const responseBundle = await handler(medplum, { bot, input: noAssessment, contentType, secrets: {} });
    const clinicalImpression = await medplum.searchResources('ClinicalImpression');

    expect(responseBundle.entry?.length).toBe(12);
    expect(clinicalImpression.length).toBe(0);
  });

  test('No Reason for Visit', async () => {
    const medplum = new MockClient();
    const testEncounter = await medplum.createResource(encounter);
    noCondition.encounter = { reference: getReferenceString(testEncounter) };

    await expect(handler(medplum, { bot, input: noCondition, contentType, secrets: {} })).rejects.toThrow(
      /^Must provide a reason for the visit$/
    );
  });

  test('Only Condition is included', async () => {
    const medplum = new MockClient();
    const testEncounter = await medplum.createResource(encounter);
    onlyCondition.encounter = { reference: getReferenceString(testEncounter) };

    const responseBundle = await handler(medplum, { bot, input: onlyCondition, contentType, secrets: {} });
    const observations = await medplum.searchResources('Observation', {
      encounter: getReferenceString(testEncounter),
    });
    const clinicalImpression = await medplum.searchResources('ClinicalImpression');
    const conditions = await medplum.searchResources('Condition', {
      encounter: getReferenceString(testEncounter),
    });

    expect(responseBundle.entry?.length).toBe(1);
    expect(observations.length).toBe(0);
    expect(clinicalImpression.length).toBe(0);
    expect(conditions.length).toBe(1);
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

    expect(responseBundle.entry?.length).toBe(13);
    expect(clinicalImpression.length).toBe(1);
    expect(observations.length).toBe(10);
    expect(conditions.length).toBe(2);
    expect(components?.length).toBe(1);
  });

  // test('Calculate BMI', async () => {
  //   const weightKg: Quantity = { value: 50, unit: 'kg' };
  //   const heightIn: Quantity = { value: 70, unit: 'in' };
  //   const heightFt: Quantity = { value: 6, unit: 'ft' };
  //   const heightM: Quantity = { value: 1.8, unit: 'm' };

  //   const bmiFromInches = calculateBMI(heightIn, weightKg);
  //   const bmiFromFeet = calculateBMI(heightFt, weightKg);
  //   const bmiFromMeters = calculateBMI(heightM, weightKg);

  //   expect(bmiFromInches.value).toBe(15.8);
  //   expect(bmiFromFeet.value).toBe(14.9);
  //   expect(bmiFromMeters.value).toBe(15.4);
  // });

  // test('BMI with no height value', async () => {
  //   expect(() => calculateBMI({ unit: 'cm' }, { value: 60, unit: 'kg' })).toThrow(/^All values must be provided$/);
  // });

  // test('BMI with no weight value', async () => {
  //   expect(() => calculateBMI({ value: 180, unit: 'cm' }, { unit: 'kg' })).toThrow(/^All values must be provided$/);
  // });

  // test('BMI with no height unit', async () => {
  //   expect(() => calculateBMI({ value: 180 }, { value: 60, unit: 'kg' })).toThrow(/^No unit defined$/);
  // });

  // test('BMI with no weight unit', async () => {
  //   expect(() => calculateBMI({ value: 180, unit: 'cm' }, { value: 50 })).toThrow(/^No unit defined$/);
  // });

  // test('BMI with unknown height unit', async () => {
  //   expect(() => calculateBMI({ value: 180, unit: 'cms' }, { value: 50, unit: 'kg' })).toThrow(
  //     /^Unknown unit. Please provide height in one of the following units: Inches, feet, centimeters, or meters.$/
  //   );
  // });

  // test('BMI with unknown weight unit', async () => {
  //   expect(() => calculateBMI({ value: 180, unit: 'cm' }, { value: 50, unit: 'kgs' })).toThrow(
  //     /^Unknown unit. Please provide weight in one of the following units: Pounds or kilograms.$/
  //   );
  // });
});

import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Quantity, SearchParameter } from '@medplum/fhirtypes';
import { calculateBMI } from './bot-utils';

describe('Bot utility function tests', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
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

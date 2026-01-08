// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ContentType,
  createReference,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  LOINC,
} from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, Observation, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, describe, beforeAll, beforeEach, vi } from 'vitest';
import { handler } from './bmi-calculation-bot';

describe('BMI Calculation Bot', () => {
  const bot: { reference: string } = { reference: 'Bot/123' };
  const contentType = ContentType.FHIR_JSON;
  const secrets = {};

  let medplum: MockClient;
  let patient: Patient;

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async () => {
    medplum = new MockClient();
    patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
    });
  });

  test('Creates BMI observation from height and weight in meters and kg', async () => {
    // Create height observation in meters
    const heightObservation = await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [
          {
            system: LOINC,
            code: '8302-2',
            display: 'Body height',
          },
        ],
      },
      valueQuantity: {
        value: 1.75,
        unit: 'm',
        system: 'http://unitsofmeasure.org',
        code: 'm',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    // Create weight observation in kg
    const weightObservation = await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [
          {
            system: LOINC,
            code: '29463-7',
            display: 'Body weight',
          },
        ],
      },
      valueQuantity: {
        value: 70,
        unit: 'kg',
        system: 'http://unitsofmeasure.org',
        code: 'kg',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    // Run the bot
    await handler(medplum, { bot, input: patient, contentType, secrets });

    // Verify BMI observation was created
    const bmiObservations = await medplum.searchResources('Observation', {
      patient: getReferenceString(patient),
      code: `${LOINC}|39156-5`,
    });

    expect(bmiObservations.length).toBe(1);
    const bmiObservation = bmiObservations[0];
    expect(bmiObservation.valueQuantity?.value).toBeCloseTo(22.86, 2); // BMI = 70 / (1.75)^2 = 22.86
    expect(bmiObservation.valueQuantity?.unit).toBe('kg/m2');
    expect(bmiObservation.derivedFrom).toHaveLength(2);
    expect(bmiObservation.derivedFrom?.some((ref) => ref.reference === getReferenceString(heightObservation))).toBe(
      true
    );
    expect(bmiObservation.derivedFrom?.some((ref) => ref.reference === getReferenceString(weightObservation))).toBe(
      true
    );
  });

  test('Converts height from inches to meters', async () => {
    // Create height observation in inches
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '8302-2', display: 'Body height' }],
      },
      valueQuantity: {
        value: 70, // 70 inches = 1.778 meters
        unit: 'in',
        system: 'http://unitsofmeasure.org',
        code: 'in',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    // Create weight observation in kg
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '29463-7', display: 'Body weight' }],
      },
      valueQuantity: {
        value: 80,
        unit: 'kg',
        system: 'http://unitsofmeasure.org',
        code: 'kg',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    await handler(medplum, { bot, input: patient, contentType, secrets });

    const bmiObservations = await medplum.searchResources('Observation', {
      patient: getReferenceString(patient),
      code: `${LOINC}|39156-5`,
    });

    expect(bmiObservations.length).toBe(1);
    // BMI = 80 / (70 * 0.0254)^2 = 80 / 1.778^2 ≈ 25.3
    expect(bmiObservations[0].valueQuantity?.value).toBeCloseTo(25.3, 1);
  });

  test('Converts height from centimeters to meters', async () => {
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '8302-2', display: 'Body height' }],
      },
      valueQuantity: {
        value: 175, // 175 cm = 1.75 meters
        unit: 'cm',
        system: 'http://unitsofmeasure.org',
        code: 'cm',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '29463-7', display: 'Body weight' }],
      },
      valueQuantity: {
        value: 70,
        unit: 'kg',
        system: 'http://unitsofmeasure.org',
        code: 'kg',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    await handler(medplum, { bot, input: patient, contentType, secrets });

    const bmiObservations = await medplum.searchResources('Observation', {
      patient: getReferenceString(patient),
      code: `${LOINC}|39156-5`,
    });

    expect(bmiObservations.length).toBe(1);
    // BMI = 70 / (175/100)^2 = 70 / 1.75^2 ≈ 22.86
    expect(bmiObservations[0].valueQuantity?.value).toBeCloseTo(22.86, 2);
  });

  test('Converts weight from pounds to kilograms', async () => {
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '8302-2', display: 'Body height' }],
      },
      valueQuantity: {
        value: 1.75,
        unit: 'm',
        system: 'http://unitsofmeasure.org',
        code: 'm',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '29463-7', display: 'Body weight' }],
      },
      valueQuantity: {
        value: 154.32, // 154.32 lbs ≈ 70 kg
        unit: 'lb',
        system: 'http://unitsofmeasure.org',
        code: 'lb',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    await handler(medplum, { bot, input: patient, contentType, secrets });

    const bmiObservations = await medplum.searchResources('Observation', {
      patient: getReferenceString(patient),
      code: `${LOINC}|39156-5`,
    });

    expect(bmiObservations.length).toBe(1);
    // BMI should be approximately 22.86 (70 kg / 1.75^2)
    expect(bmiObservations[0].valueQuantity?.value).toBeCloseTo(22.86, 1);
  });

  test('Converts weight from grams to kilograms', async () => {
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '8302-2', display: 'Body height' }],
      },
      valueQuantity: {
        value: 1.75,
        unit: 'm',
        system: 'http://unitsofmeasure.org',
        code: 'm',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '29463-7', display: 'Body weight' }],
      },
      valueQuantity: {
        value: 70000, // 70000 g = 70 kg
        unit: 'g',
        system: 'http://unitsofmeasure.org',
        code: 'g',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    await handler(medplum, { bot, input: patient, contentType, secrets });

    const bmiObservations = await medplum.searchResources('Observation', {
      patient: getReferenceString(patient),
      code: `${LOINC}|39156-5`,
    });

    expect(bmiObservations.length).toBe(1);
    expect(bmiObservations[0].valueQuantity?.value).toBeCloseTo(22.86, 2);
  });

  test('Uses latest observation when multiple exist', async () => {
    // Create older height observation
    const oldHeight = await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '8302-2', display: 'Body height' }],
      },
      valueQuantity: {
        value: 1.7,
        unit: 'm',
        system: 'http://unitsofmeasure.org',
        code: 'm',
      },
      effectiveDateTime: '2024-01-01T00:00:00Z',
    });

    // Create newer height observation
    const newHeight = await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '8302-2', display: 'Body height' }],
      },
      valueQuantity: {
        value: 1.75,
        unit: 'm',
        system: 'http://unitsofmeasure.org',
        code: 'm',
      },
      effectiveDateTime: '2024-01-15T00:00:00Z',
    });

    // Create weight observation
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '29463-7', display: 'Body weight' }],
      },
      valueQuantity: {
        value: 70,
        unit: 'kg',
        system: 'http://unitsofmeasure.org',
        code: 'kg',
      },
      effectiveDateTime: '2024-01-10T00:00:00Z',
    });

    await handler(medplum, { bot, input: patient, contentType, secrets });

    const bmiObservations = await medplum.searchResources('Observation', {
      patient: getReferenceString(patient),
      code: `${LOINC}|39156-5`,
    });

    expect(bmiObservations.length).toBe(1);
    // Should use newHeight (1.75m), not oldHeight (1.70m)
    // BMI = 70 / 1.75^2 ≈ 22.86
    expect(bmiObservations[0].valueQuantity?.value).toBeCloseTo(22.86, 2);
    // Verify it references the latest height observation
    expect(bmiObservations[0].derivedFrom?.some((ref) => ref.reference === getReferenceString(newHeight))).toBe(true);
    expect(bmiObservations[0].derivedFrom?.some((ref) => ref.reference === getReferenceString(oldHeight))).toBe(false);
  });

  test('Does not create BMI observation when height observation is missing', async () => {
    // Only create weight observation
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '29463-7', display: 'Body weight' }],
      },
      valueQuantity: {
        value: 70,
        unit: 'kg',
        system: 'http://unitsofmeasure.org',
        code: 'kg',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handler(medplum, { bot, input: patient, contentType, secrets });

    const bmiObservations = await medplum.searchResources('Observation', {
      patient: getReferenceString(patient),
      code: `${LOINC}|39156-5`,
    });

    expect(bmiObservations.length).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No height observation found'));

    consoleSpy.mockRestore();
  });

  test('Does not create BMI observation when weight observation is missing', async () => {
    // Only create height observation
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '8302-2', display: 'Body height' }],
      },
      valueQuantity: {
        value: 1.75,
        unit: 'm',
        system: 'http://unitsofmeasure.org',
        code: 'm',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handler(medplum, { bot, input: patient, contentType, secrets });

    const bmiObservations = await medplum.searchResources('Observation', {
      patient: getReferenceString(patient),
      code: `${LOINC}|39156-5`,
    });

    expect(bmiObservations.length).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No weight observation found'));

    consoleSpy.mockRestore();
  });

  test('Does not create BMI observation when height value is missing', async () => {
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '8302-2', display: 'Body height' }],
      },
      // Missing valueQuantity
      effectiveDateTime: new Date().toISOString(),
    });

    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '29463-7', display: 'Body weight' }],
      },
      valueQuantity: {
        value: 70,
        unit: 'kg',
        system: 'http://unitsofmeasure.org',
        code: 'kg',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handler(medplum, { bot, input: patient, contentType, secrets });

    const bmiObservations = await medplum.searchResources('Observation', {
      patient: getReferenceString(patient),
      code: `${LOINC}|39156-5`,
    });

    expect(bmiObservations.length).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Missing values'));

    consoleSpy.mockRestore();
  });

  test('Creates multiple BMI observations over time', async () => {
    // First set of observations
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '8302-2', display: 'Body height' }],
      },
      valueQuantity: {
        value: 1.75,
        unit: 'm',
        system: 'http://unitsofmeasure.org',
        code: 'm',
      },
      effectiveDateTime: '2024-01-01T00:00:00Z',
    });

    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '29463-7', display: 'Body weight' }],
      },
      valueQuantity: {
        value: 70,
        unit: 'kg',
        system: 'http://unitsofmeasure.org',
        code: 'kg',
      },
      effectiveDateTime: '2024-01-01T00:00:00Z',
    });

    await handler(medplum, { bot, input: patient, contentType, secrets });

    // Second set of observations (weight changed)
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '29463-7', display: 'Body weight' }],
      },
      valueQuantity: {
        value: 75,
        unit: 'kg',
        system: 'http://unitsofmeasure.org',
        code: 'kg',
      },
      effectiveDateTime: '2024-02-01T00:00:00Z',
    });

    await handler(medplum, { bot, input: patient, contentType, secrets });

    // Should have 2 BMI observations
    const bmiObservations = await medplum.searchResources('Observation', {
      patient: getReferenceString(patient),
      code: `${LOINC}|39156-5`,
    });

    expect(bmiObservations.length).toBe(2);
    // First BMI: 70 / 1.75^2 ≈ 22.86
    // Second BMI: 75 / 1.75^2 ≈ 24.49
    const bmiValues = bmiObservations.map((obs) => obs.valueQuantity?.value).sort((a, b) => (a || 0) - (b || 0));
    expect(bmiValues[0]).toBeCloseTo(22.86, 1);
    expect(bmiValues[1]).toBeCloseTo(24.49, 1);
  });

  test('Handles edge case with very high BMI', async () => {
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '8302-2', display: 'Body height' }],
      },
      valueQuantity: {
        value: 1.6,
        unit: 'm',
        system: 'http://unitsofmeasure.org',
        code: 'm',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '29463-7', display: 'Body weight' }],
      },
      valueQuantity: {
        value: 120,
        unit: 'kg',
        system: 'http://unitsofmeasure.org',
        code: 'kg',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    await handler(medplum, { bot, input: patient, contentType, secrets });

    const bmiObservations = await medplum.searchResources('Observation', {
      patient: getReferenceString(patient),
      code: `${LOINC}|39156-5`,
    });

    expect(bmiObservations.length).toBe(1);
    // BMI = 120 / 1.60^2 = 46.875
    expect(bmiObservations[0].valueQuantity?.value).toBeCloseTo(46.875, 2);
  });

  test('Handles edge case with very low BMI', async () => {
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '8302-2', display: 'Body height' }],
      },
      valueQuantity: {
        value: 1.8,
        unit: 'm',
        system: 'http://unitsofmeasure.org',
        code: 'm',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: {
        coding: [{ system: LOINC, code: '29463-7', display: 'Body weight' }],
      },
      valueQuantity: {
        value: 50,
        unit: 'kg',
        system: 'http://unitsofmeasure.org',
        code: 'kg',
      },
      effectiveDateTime: new Date().toISOString(),
    });

    await handler(medplum, { bot, input: patient, contentType, secrets });

    const bmiObservations = await medplum.searchResources('Observation', {
      patient: getReferenceString(patient),
      code: `${LOINC}|39156-5`,
    });

    expect(bmiObservations.length).toBe(1);
    // BMI = 50 / 1.80^2 ≈ 15.43
    expect(bmiObservations[0].valueQuantity?.value).toBeCloseTo(15.43, 2);
  });
});

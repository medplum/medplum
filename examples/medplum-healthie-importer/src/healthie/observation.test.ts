// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest';
import { HEALTHIE_ENTRY_ID_SYSTEM } from './constants';
import { convertHealthieEntryToFhir, getLoincMapping } from './observation';
import type { HealthieMetricEntry } from './observation';

describe('convertHealthieEntryToFhir', () => {
  const patientRef = { reference: 'Patient/123', display: 'Test Patient' } as const;

  test('converts a Weight entry with LOINC mapping', () => {
    const entry: HealthieMetricEntry = {
      id: '100',
      category: 'Weight',
      metric_stat: 150,
      created_at: '2025-03-26 14:27:27 -0700',
    };

    const result = convertHealthieEntryToFhir(entry, patientRef);

    expect(result.resourceType).toBe('Observation');
    expect(result.identifier).toEqual([{ system: HEALTHIE_ENTRY_ID_SYSTEM, value: '100' }]);
    expect(result.status).toBe('final');
    expect(result.category?.[0].coding?.[0].code).toBe('vital-signs');
    expect(result.code?.coding?.[0].system).toBe('http://loinc.org');
    expect(result.code?.coding?.[0].code).toBe('29463-7');
    expect(result.code?.text).toBe('Weight');
    expect(result.subject).toEqual(patientRef);
    expect(result.effectiveDateTime).toBe('2025-03-26T21:27:27.000Z');
    expect(result.valueQuantity?.value).toBe(150);
    expect(result.valueQuantity?.unit).toBe('lbs');
    expect(result.valueQuantity?.system).toBe('http://unitsofmeasure.org');
    expect(result.valueQuantity?.code).toBe('[lb_av]');
  });

  test('converts a lab result with LOINC mapping', () => {
    const entry: HealthieMetricEntry = {
      id: '200',
      category: 'Glucose [Mass/volume] in Serum or Plasma',
      metric_stat: 70.4,
      created_at: '2026-03-09T19:17:50.000Z',
    };

    const result = convertHealthieEntryToFhir(entry, patientRef);

    expect(result.category?.[0].coding?.[0].code).toBe('laboratory');
    expect(result.category?.[0].coding?.[0].display).toBe('Laboratory');
    expect(result.code?.coding?.[0].code).toBe('2345-7');
    expect(result.valueQuantity?.value).toBe(70.4);
    expect(result.valueQuantity?.unit).toBe('mg/dL');
    expect(result.valueQuantity?.code).toBe('mg/dL');
  });

  test('converts an unknown category without LOINC code', () => {
    const entry: HealthieMetricEntry = {
      id: '300',
      category: 'Some Custom Metric',
      metric_stat: 42,
      created_at: '2025-01-01T00:00:00Z',
    };

    const result = convertHealthieEntryToFhir(entry, patientRef);

    expect(result.code?.coding).toBeUndefined();
    expect(result.code?.text).toBe('Some Custom Metric');
    expect(result.category?.[0].coding?.[0].code).toBe('laboratory');
    expect(result.valueQuantity?.value).toBe(42);
    expect(result.valueQuantity?.unit).toBe('Some Custom Metric');
    expect(result.valueQuantity?.code).toBeUndefined();
  });

  test('converts Blood Pressure Systolic as vital-signs', () => {
    const entry: HealthieMetricEntry = {
      id: '400',
      category: 'Blood Pressure Systolic',
      metric_stat: 120,
      created_at: '2025-06-15T10:00:00Z',
    };

    const result = convertHealthieEntryToFhir(entry, patientRef);

    expect(result.category?.[0].coding?.[0].code).toBe('vital-signs');
    expect(result.code?.coding?.[0].code).toBe('8480-6');
    expect(result.valueQuantity?.unit).toBe('mmHg');
    expect(result.valueQuantity?.code).toBe('mm[Hg]');
  });

  test('converts Blood Pressure Diastolic', () => {
    const entry: HealthieMetricEntry = {
      id: '401',
      category: 'Blood Pressure Diastolic',
      metric_stat: 80,
      created_at: '2025-06-15T10:00:00Z',
    };

    const result = convertHealthieEntryToFhir(entry, patientRef);

    expect(result.code?.coding?.[0].code).toBe('8462-4');
    expect(result.valueQuantity?.value).toBe(80);
  });

  test('converts Heart Rate', () => {
    const entry: HealthieMetricEntry = {
      id: '500',
      category: 'Heart Rate',
      metric_stat: 72,
      created_at: '2025-06-15T10:00:00Z',
    };

    const result = convertHealthieEntryToFhir(entry, patientRef);

    expect(result.code?.coding?.[0].code).toBe('8867-4');
    expect(result.valueQuantity?.unit).toBe('/min');
    expect(result.category?.[0].coding?.[0].code).toBe('vital-signs');
  });

  test('converts BMI', () => {
    const entry: HealthieMetricEntry = {
      id: '600',
      category: 'BMI',
      metric_stat: 24.5,
      created_at: '2025-06-15T10:00:00Z',
    };

    const result = convertHealthieEntryToFhir(entry, patientRef);

    expect(result.code?.coding?.[0].code).toBe('39156-5');
    expect(result.valueQuantity?.unit).toBe('kg/m2');
  });

  test('converts A1c as laboratory', () => {
    const entry: HealthieMetricEntry = {
      id: '700',
      category: 'Hemoglobin A1c/Hemoglobin.total in Blood',
      metric_stat: 5.7,
      created_at: '2025-06-15T10:00:00Z',
    };

    const result = convertHealthieEntryToFhir(entry, patientRef);

    expect(result.category?.[0].coding?.[0].code).toBe('laboratory');
    expect(result.code?.coding?.[0].code).toBe('4548-4');
    expect(result.valueQuantity?.unit).toBe('%');
  });

  test('converts Body Fat %', () => {
    const entry: HealthieMetricEntry = {
      id: '800',
      category: 'Body Fat %',
      metric_stat: 18.5,
      created_at: '2025-06-15T10:00:00Z',
    };

    const result = convertHealthieEntryToFhir(entry, patientRef);

    expect(result.code?.coding?.[0].code).toBe('41982-0');
    expect(result.category?.[0].coding?.[0].code).toBe('vital-signs');
  });

  test('converts Respiratory Rate', () => {
    const entry: HealthieMetricEntry = {
      id: '900',
      category: 'Respiratory Rate',
      metric_stat: 16,
      created_at: '2025-06-15T10:00:00Z',
    };

    const result = convertHealthieEntryToFhir(entry, patientRef);

    expect(result.code?.coding?.[0].code).toBe('9279-1');
    expect(result.valueQuantity?.unit).toBe('/min');
  });

  test('converts Body temperature', () => {
    const entry: HealthieMetricEntry = {
      id: '1000',
      category: 'Body temperature',
      metric_stat: 37.2,
      created_at: '2025-06-15T10:00:00Z',
    };

    const result = convertHealthieEntryToFhir(entry, patientRef);

    expect(result.code?.coding?.[0].code).toBe('8310-5');
    expect(result.valueQuantity?.unit).toBe('Cel');
  });

  test('normalizes Healthie date format', () => {
    const entry: HealthieMetricEntry = {
      id: '1100',
      category: 'Weight',
      metric_stat: 150,
      created_at: '2025-03-26 12:00:00 -0700',
    };

    const result = convertHealthieEntryToFhir(entry, patientRef);

    expect(result.effectiveDateTime).toBe('2025-03-26T19:00:00.000Z');
  });

  test('converts Cholesterol panel labs', () => {
    const entry: HealthieMetricEntry = {
      id: '1200',
      category: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma',
      metric_stat: 55,
      created_at: '2025-06-15T10:00:00Z',
    };

    const result = convertHealthieEntryToFhir(entry, patientRef);

    expect(result.code?.coding?.[0].code).toBe('2085-9');
    expect(result.valueQuantity?.unit).toBe('mg/dL');
    expect(result.category?.[0].coding?.[0].code).toBe('laboratory');
  });

  test('handles zero metric_stat', () => {
    const entry: HealthieMetricEntry = {
      id: '1300',
      category: 'Appearance of Urine',
      metric_stat: 0,
      created_at: '2025-06-15T10:00:00Z',
    };

    const result = convertHealthieEntryToFhir(entry, patientRef);

    expect(result.valueQuantity?.value).toBe(0);
  });
});

describe('getLoincMapping', () => {
  test('returns mapping for known vital-signs category', () => {
    const mapping = getLoincMapping('Weight');
    expect(mapping).toBeDefined();
    expect(mapping?.code).toBe('29463-7');
    expect(mapping?.fhirCategory).toBe('vital-signs');
  });

  test('returns mapping for known laboratory category', () => {
    const mapping = getLoincMapping('Glucose [Mass/volume] in Serum or Plasma');
    expect(mapping).toBeDefined();
    expect(mapping?.code).toBe('2345-7');
    expect(mapping?.fhirCategory).toBe('laboratory');
  });

  test('returns undefined for unknown category', () => {
    const mapping = getLoincMapping('Custom Unknown Metric');
    expect(mapping).toBeUndefined();
  });

  test('returns mapping for CBC labs', () => {
    expect(getLoincMapping('Hemoglobin [Mass/volume] in Blood')?.code).toBe('718-7');
    expect(getLoincMapping('Platelets [#/volume] in Blood by Automated count')?.code).toBe('777-3');
    expect(getLoincMapping('Hematocrit [Volume Fraction] of Blood by Automated count')?.code).toBe('4544-3');
  });
});

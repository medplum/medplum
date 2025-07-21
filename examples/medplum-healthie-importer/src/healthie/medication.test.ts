import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HealthieClient } from './client';
import {
  HEALTHIE_MEDICATION_CODE_SYSTEM,
  HEALTHIE_MEDICATION_ID_SYSTEM,
  HEALTHIE_MEDICATION_ROUTE_CODE_SYSTEM,
} from './constants';
import { convertHealthieMedicationToFhir, fetchMedications, HealthieMedicationType, parseDosage } from './medication';

type MockResponse = {
  json: () => Promise<any>;
  ok: boolean;
  status: number;
};

describe('fetchMedications', () => {
  let healthieClient: HealthieClient;
  const mockBaseUrl = 'https://api.example.com/graphql';
  const mockClientSecret = 'test-secret';
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    healthieClient = new HealthieClient(mockBaseUrl, mockClientSecret);
    // Mock fetch globally
    mockFetch = vi.fn().mockImplementation((): Promise<MockResponse> => {
      return Promise.resolve({
        json: () => Promise.resolve({}),
        ok: true,
        status: 200,
      });
    });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('returns medication data for a patient', async () => {
    const mockMedications = [
      {
        id: 'med123',
        name: 'Test Medication',
        active: true,
        start_date: '2024-01-01',
        end_date: '2024-12-31',
      },
    ];

    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { medications: mockMedications } }),
          ok: true,
          status: 200,
        })
    );

    const result = await fetchMedications(healthieClient, 'patient123');
    expect(result).toEqual(mockMedications);

    // Verify the query includes the patient ID
    expect(mockFetch).toHaveBeenCalledWith(
      mockBaseUrl,
      expect.objectContaining({
        body: expect.stringContaining('patient123'),
      })
    );
  });
});

describe('convertHealthieMedicationToFhir', () => {
  const mockMedication: HealthieMedicationType = {
    id: 'med123',
    name: 'Test Medication',
    active: true,
    dosage: '10 MG',
    code: 'MED001',
    comment: 'Take with food',
    created_at: '2024-01-01T00:00:00Z',
    mirrored: false,
  };

  test('converts basic medication to FHIR', () => {
    const result = convertHealthieMedicationToFhir(mockMedication, {
      display: 'Test Patient',
      reference: 'Patient/123',
    });

    expect(result).toEqual({
      resourceType: 'MedicationRequest',
      identifier: [{ system: HEALTHIE_MEDICATION_ID_SYSTEM, value: 'med123' }],
      status: 'active',
      intent: 'proposal',
      subject: {
        display: 'Test Patient',
        reference: 'Patient/123',
      },
      medicationCodeableConcept: {
        text: 'Test Medication',
        coding: [
          {
            system: HEALTHIE_MEDICATION_CODE_SYSTEM,
            code: 'MED001',
            display: 'Test Medication',
          },
        ],
      },
      dosageInstruction: [
        {
          doseAndRate: [
            {
              doseQuantity: {
                value: 10,
                unit: 'MG',
                system: 'http://unitsofmeasure.org',
              },
            },
          ],
        },
      ],
      note: [{ text: 'Take with food' }],
    });
  });

  test('handles inactive medication', () => {
    const inactiveMedication: HealthieMedicationType = {
      ...mockMedication,
      active: false,
    };

    const result = convertHealthieMedicationToFhir(inactiveMedication, {
      display: 'Test Patient',
      reference: 'Patient/123',
    });

    expect(result.status).toBe('unknown');
  });

  test('handles medication without dosage', () => {
    const medicationWithoutDosage: HealthieMedicationType = {
      ...mockMedication,
      dosage: undefined,
    };

    const result = convertHealthieMedicationToFhir(medicationWithoutDosage, { display: 'John Doe' });

    expect(result.dosageInstruction).toBeUndefined();
  });

  test('handles medication without comment', () => {
    const medicationWithoutComment: HealthieMedicationType = {
      ...mockMedication,
      comment: undefined,
    };

    const result = convertHealthieMedicationToFhir(medicationWithoutComment, { display: 'John Doe' });

    expect(result.note).toBeUndefined();
  });

  test('handles medication without code', () => {
    const medicationWithoutCode: HealthieMedicationType = {
      ...mockMedication,
      code: undefined,
    };

    const result = convertHealthieMedicationToFhir(medicationWithoutCode, { display: 'John Doe' });

    expect(result.medicationCodeableConcept?.coding?.[0].code).toBeUndefined();
  });

  test('handles medication without name', () => {
    const medicationWithoutName: HealthieMedicationType = {
      ...mockMedication,
      name: undefined,
    };

    const result = convertHealthieMedicationToFhir(medicationWithoutName, { display: 'John Doe' });

    expect(result.medicationCodeableConcept?.text).toBeUndefined();
    expect(result.medicationCodeableConcept?.coding?.[0].display).toBeUndefined();
  });

  test('handles invalid dosage', () => {
    const medicationWithInvalidDosage: HealthieMedicationType = {
      ...mockMedication,
      dosage: 'invalid dosage',
    };

    const result = convertHealthieMedicationToFhir(medicationWithInvalidDosage, { display: 'John Doe' });

    expect(result.dosageInstruction?.[0].doseAndRate?.[0].doseQuantity).toBeUndefined();
  });

  test('handles medication with route', () => {
    const medicationWithRoute: HealthieMedicationType = {
      ...mockMedication,
      route: 'oral',
    };

    const result = convertHealthieMedicationToFhir(medicationWithRoute, {
      display: 'Test Patient',
      reference: 'Patient/123',
    });

    expect(result.dosageInstruction?.[0].route).toEqual({
      text: 'oral',
      coding: [
        {
          system: HEALTHIE_MEDICATION_ROUTE_CODE_SYSTEM,
          code: 'oral',
          display: 'oral',
        },
      ],
    });
  });

  test('handles medication without route', () => {
    const medicationWithoutRoute: HealthieMedicationType = {
      ...mockMedication,
      route: undefined,
    };

    const result = convertHealthieMedicationToFhir(medicationWithoutRoute, {
      display: 'Test Patient',
      reference: 'Patient/123',
    });

    expect(result.dosageInstruction?.[0].route).toBeUndefined();
  });
});

describe('parseDosage', () => {
  test('parses valid dosage strings', () => {
    expect(parseDosage('10 MG')).toEqual({
      value: 10,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });

    expect(parseDosage('650 MG')).toEqual({
      value: 650,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });

    expect(parseDosage('5.5 ML')).toEqual({
      value: 5.5,
      unit: 'ML',
      system: 'http://unitsofmeasure.org',
    });
  });

  test('handles invalid or missing input', () => {
    expect(parseDosage(undefined)).toBeUndefined();
    expect(parseDosage('')).toBeUndefined();
    expect(parseDosage('invalid')).toBeUndefined();
    expect(parseDosage('10')).toBeUndefined();
    expect(parseDosage('MG')).toBeUndefined();
    expect(parseDosage('10 mg mg')).toBeUndefined();
  });

  test('handles decimal variations', () => {
    // Leading zeros
    expect(parseDosage('010 MG')).toEqual({
      value: 10,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });

    // Trailing zeros
    expect(parseDosage('10.0 MG')).toEqual({
      value: 10,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });

    expect(parseDosage('10.00 MG')).toEqual({
      value: 10,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });

    // Many decimal places
    expect(parseDosage('10.123456 MG')).toEqual({
      value: 10.123456,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });

    // Very small decimals
    expect(parseDosage('0.001 MG')).toEqual({
      value: 0.001,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });

    expect(parseDosage('0.0001 MG')).toEqual({
      value: 0.0001,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });
  });

  test('handles spacing variations', () => {
    // No space
    expect(parseDosage('10MG')).toEqual({
      value: 10,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });

    // Multiple spaces
    expect(parseDosage('10    MG')).toEqual({
      value: 10,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });

    // Tab character
    expect(parseDosage('10\tMG')).toEqual({
      value: 10,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });
  });

  test('handles case variations in units', () => {
    expect(parseDosage('10 mg')).toEqual({
      value: 10,
      unit: 'mg',
      system: 'http://unitsofmeasure.org',
    });

    expect(parseDosage('10 Mg')).toEqual({
      value: 10,
      unit: 'Mg',
      system: 'http://unitsofmeasure.org',
    });

    expect(parseDosage('10 mG')).toEqual({
      value: 10,
      unit: 'mG',
      system: 'http://unitsofmeasure.org',
    });

    expect(parseDosage('5 ml')).toEqual({
      value: 5,
      unit: 'ml',
      system: 'http://unitsofmeasure.org',
    });

    expect(parseDosage('5 mL')).toEqual({
      value: 5,
      unit: 'mL',
      system: 'http://unitsofmeasure.org',
    });
  });

  test('handles common medical units', () => {
    expect(parseDosage('100 mcg')).toEqual({
      value: 100,
      unit: 'mcg',
      system: 'http://unitsofmeasure.org',
    });

    expect(parseDosage('500 IU')).toEqual({
      value: 500,
      unit: 'IU',
      system: 'http://unitsofmeasure.org',
    });

    expect(parseDosage('10 units')).toEqual({
      value: 10,
      unit: 'units',
      system: 'http://unitsofmeasure.org',
    });

    expect(parseDosage('2 tabs')).toEqual({
      value: 2,
      unit: 'tabs',
      system: 'http://unitsofmeasure.org',
    });

    expect(parseDosage('1 capsule')).toEqual({
      value: 1,
      unit: 'capsule',
      system: 'http://unitsofmeasure.org',
    });
  });

  test('handles large numbers', () => {
    expect(parseDosage('1000000 MG')).toEqual({
      value: 1000000,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });

    expect(parseDosage('999999.999 MG')).toEqual({
      value: 999999.999,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });
  });

  test('handles zero values', () => {
    expect(parseDosage('0 MG')).toEqual({
      value: 0,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });

    expect(parseDosage('0.0 MG')).toEqual({
      value: 0,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });
  });

  test('handles edge cases that should fail', () => {
    // Leading decimal point without leading zero - should fail with current regex
    expect(parseDosage('.5 MG')).toBeUndefined();

    // Negative values - should fail with current regex
    expect(parseDosage('-10 MG')).toBeUndefined();

    // Scientific notation - should fail with current regex
    expect(parseDosage('1e-3 MG')).toBeUndefined();
    expect(parseDosage('1E-3 MG')).toBeUndefined();

    // Fractional representation - should fail with current regex
    expect(parseDosage('1/2 MG')).toBeUndefined();

    // Multiple decimal points
    expect(parseDosage('10.5.5 MG')).toBeUndefined();

    // Units with numbers
    expect(parseDosage('10 MG5')).toBeUndefined();

    // Units with special characters
    expect(parseDosage('10 MG-')).toBeUndefined();
    expect(parseDosage('10 MG_')).toBeUndefined();

    // Leading/trailing whitespace around entire string
    expect(parseDosage(' 10 MG ')).toBeUndefined();
    expect(parseDosage('10 MG ')).toBeUndefined();
    expect(parseDosage(' 10 MG')).toBeUndefined();

    // Multiple values
    expect(parseDosage('10 20 MG')).toBeUndefined();
    expect(parseDosage('10 MG 20')).toBeUndefined();
  });

  test('handles problematic but potentially valid inputs', () => {
    // Very long unit names
    expect(parseDosage('10 milligrams')).toEqual({
      value: 10,
      unit: 'milligrams',
      system: 'http://unitsofmeasure.org',
    });

    // Units with mixed case
    expect(parseDosage('10 InternationalUnits')).toEqual({
      value: 10,
      unit: 'InternationalUnits',
      system: 'http://unitsofmeasure.org',
    });

    // Single character units
    expect(parseDosage('10 g')).toEqual({
      value: 10,
      unit: 'g',
      system: 'http://unitsofmeasure.org',
    });

    // Very long unit abbreviations
    expect(parseDosage('10 mcgkgmin')).toEqual({
      value: 10,
      unit: 'mcgkgmin',
      system: 'http://unitsofmeasure.org',
    });
  });
});

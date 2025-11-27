// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HealthieClient } from './client';
import { HEALTHIE_ALLERGY_CODE_SYSTEM, HEALTHIE_ALLERGY_ID_SYSTEM, HEALTHIE_REACTION_CODE_SYSTEM } from './constants';
import {
  convertHealthieAllergyToFhir,
  fetchAllergySensitivities,
  mapHealthieStatusToClinicalStatus,
  mapHealthieCategoryToType,
  mapHealthieCategoryTypeToCategory,
  mapHealthieSeverityToCriticality,
  mapHealthieSeverityToReactionSeverity,
} from './allergy';
import type { HealthieAllergySensitivity } from './allergy';

type MockResponse = {
  json: () => Promise<any>;
  ok: boolean;
  status: number;
};

describe('fetchAllergySensitivities', () => {
  let healthieClient: HealthieClient;
  const mockBaseUrl = 'https://api.example.com/graphql';
  const mockClientSecret = 'test-secret';
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    healthieClient = new HealthieClient(mockBaseUrl, mockClientSecret);
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

  test('returns allergy data for a patient', async () => {
    const mockAllergies = [
      {
        id: 'allergy123',
        category: 'allergy',
        category_type: 'drug',
        created_at: '2024-01-01T00:00:00Z',
        mirrored: false,
        name: 'Penicillin',
        reaction: 'Rash',
        severity: 'moderate',
        status: 'active',
      },
    ];

    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { user: { allergy_sensitivities: mockAllergies } } }),
          ok: true,
          status: 200,
        })
    );

    const result = await fetchAllergySensitivities(healthieClient, 'patient123');
    expect(result).toEqual(mockAllergies);
  });

  test('returns empty array when no allergies found', async () => {
    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { user: { allergy_sensitivities: [] } } }),
          ok: true,
          status: 200,
        })
    );

    const result = await fetchAllergySensitivities(healthieClient, 'patient123');
    expect(result).toEqual([]);
  });
});

describe('convertHealthieAllergyToFhir', () => {
  const mockAllergy: HealthieAllergySensitivity = {
    id: 'allergy123',
    category: 'allergy',
    category_type: 'drug',
    created_at: '2024-01-01T00:00:00Z',
    mirrored: false,
    name: 'Penicillin',
    onset_date: '2024-01-01',
    reaction: 'Rash',
    reaction_type: 'allergy',
    severity: 'moderate',
    status: 'active',
  };

  test('converts basic allergy to FHIR', () => {
    const result = convertHealthieAllergyToFhir(mockAllergy, {
      display: 'Test Patient',
      reference: 'Patient/123',
    });

    expect(result).toEqual({
      resourceType: 'AllergyIntolerance',
      identifier: [{ system: HEALTHIE_ALLERGY_ID_SYSTEM, value: 'allergy123' }],
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
            code: 'active',
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
            code: 'confirmed',
          },
        ],
      },
      type: 'allergy',
      category: ['medication'],
      criticality: 'low',
      patient: {
        display: 'Test Patient',
        reference: 'Patient/123',
      },
      onsetDateTime: '2024-01-01',
      code: {
        text: 'Penicillin',
        coding: [
          {
            system: HEALTHIE_ALLERGY_CODE_SYSTEM,
            code: 'Penicillin',
            display: 'Penicillin',
          },
        ],
      },
      reaction: [
        {
          substance: {
            text: 'Penicillin',
            coding: [
              {
                system: HEALTHIE_ALLERGY_CODE_SYSTEM,
                code: 'Penicillin',
                display: 'Penicillin',
              },
            ],
          },
          manifestation: [
            {
              text: 'Rash',
              coding: [
                {
                  system: HEALTHIE_REACTION_CODE_SYSTEM,
                  code: 'Rash',
                  display: 'Rash',
                },
              ],
            },
          ],
          severity: 'moderate',
        },
      ],
      note: [{ text: 'Rash' }],
    });
  });

  test('handles allergy without reaction', () => {
    const allergyWithoutReaction: HealthieAllergySensitivity = {
      ...mockAllergy,
      reaction: undefined,
    };

    const result = convertHealthieAllergyToFhir(allergyWithoutReaction, {
      display: 'Test Patient',
      reference: 'Patient/123',
    });

    expect(result.reaction).toBeUndefined();
    expect(result.note).toBeUndefined();
  });
});

describe('mapHealthieStatusToClinicalStatus', () => {
  test('maps valid status values', () => {
    expect(mapHealthieStatusToClinicalStatus('active')).toBe('active');
    expect(mapHealthieStatusToClinicalStatus('inactive')).toBe('inactive');
    expect(mapHealthieStatusToClinicalStatus('resolved')).toBe('resolved');
  });

  test('handles invalid or missing status', () => {
    expect(mapHealthieStatusToClinicalStatus(undefined)).toBe('active');
    expect(mapHealthieStatusToClinicalStatus('unknown')).toBe('active');
  });
});

describe('mapHealthieCategoryToType', () => {
  test('maps valid category values', () => {
    expect(mapHealthieCategoryToType('allergy')).toBe('allergy');
    expect(mapHealthieCategoryToType('intolerance')).toBe('intolerance');
    expect(mapHealthieCategoryToType('sensitivity')).toBe('allergy');
    expect(mapHealthieCategoryToType('preference')).toBe('allergy');
    expect(mapHealthieCategoryToType('ccda')).toBe('allergy');
  });
});

describe('mapHealthieCategoryTypeToCategory', () => {
  test('maps valid category_type values', () => {
    expect(mapHealthieCategoryTypeToCategory('food')).toBe('food');
    expect(mapHealthieCategoryTypeToCategory('drug')).toBe('medication');
    expect(mapHealthieCategoryTypeToCategory('environmental')).toBe('environment');
    expect(mapHealthieCategoryTypeToCategory('pet')).toBe('environment');
    expect(mapHealthieCategoryTypeToCategory('latex')).toBe('environment');
  });

  test('handles invalid or missing category_type', () => {
    expect(mapHealthieCategoryTypeToCategory(undefined)).toBe('environment');
    expect(mapHealthieCategoryTypeToCategory('unknown')).toBe('environment');
  });
});

describe('mapHealthieSeverityToCriticality', () => {
  test('maps valid severity values', () => {
    expect(mapHealthieSeverityToCriticality('mild')).toBe('low');
    expect(mapHealthieSeverityToCriticality('moderate')).toBe('low');
    expect(mapHealthieSeverityToCriticality('severe')).toBe('high');
    expect(mapHealthieSeverityToCriticality('unknown')).toBe('low');
  });

  test('handles missing severity', () => {
    expect(mapHealthieSeverityToCriticality(undefined)).toBe('low');
  });
});

describe('mapHealthieSeverityToReactionSeverity', () => {
  test('maps valid severity values', () => {
    expect(mapHealthieSeverityToReactionSeverity('mild')).toBe('mild');
    expect(mapHealthieSeverityToReactionSeverity('moderate')).toBe('moderate');
    expect(mapHealthieSeverityToReactionSeverity('severe')).toBe('severe');
    expect(mapHealthieSeverityToReactionSeverity('unknown')).toBeUndefined();
  });

  test('handles missing severity', () => {
    expect(mapHealthieSeverityToReactionSeverity(undefined)).toBeUndefined();
  });
});

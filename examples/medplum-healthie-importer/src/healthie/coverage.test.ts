// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HealthieClient } from './client';
import { HEALTHIE_POLICY_ID_SYSTEM } from './constants';
import { convertHealthiePolicyToFhir, fetchPolicies, mapPriorityType, mapHolderRelationship } from './coverage';
import type { HealthiePolicy } from './coverage';

type MockResponse = {
  json: () => Promise<any>;
  ok: boolean;
  status: number;
};

describe('fetchPolicies', () => {
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

  test('returns policies for a patient', async () => {
    const mockPolicies: HealthiePolicy[] = [
      {
        id: 'policy123',
        num: 'INS-001',
        group_num: 'GRP-100',
        priority_type: 'primary',
        holder_relationship: 'self',
        insurance_plan: { id: 'plan1', payer_name: 'Blue Cross' },
      },
    ];

    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { user: { policies: mockPolicies } } }),
          ok: true,
          status: 200,
        })
    );

    const result = await fetchPolicies(healthieClient, 'patient123');
    expect(result).toEqual(mockPolicies);
  });

  test('returns empty array when no policies found', async () => {
    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { user: { policies: [] } } }),
          ok: true,
          status: 200,
        })
    );

    const result = await fetchPolicies(healthieClient, 'patient123');
    expect(result).toEqual([]);
  });

  test('returns empty array when user is null', async () => {
    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { user: null } }),
          ok: true,
          status: 200,
        })
    );

    const result = await fetchPolicies(healthieClient, 'patient123');
    expect(result).toEqual([]);
  });
});

describe('convertHealthiePolicyToFhir', () => {
  const patientRef = { reference: 'Patient/123', display: 'Test Patient' } as const;

  test('converts primary policy with all fields', () => {
    const policy: HealthiePolicy = {
      id: 'pol-1',
      num: 'INS-12345',
      group_num: 'GRP-999',
      priority_type: 'primary',
      holder_relationship: 'self',
      holder_first: 'John',
      holder_last: 'Doe',
      effective_start: '2024-01-01',
      effective_end: '2024-12-31',
      copay_value: 25,
      coinsurance_value: 20,
      insurance_plan: { id: 'plan1', payer_name: 'Aetna' },
    };

    const result = convertHealthiePolicyToFhir(policy, patientRef);

    expect(result.resourceType).toBe('Coverage');
    expect(result.status).toBe('active');
    expect(result.identifier).toEqual([{ system: HEALTHIE_POLICY_ID_SYSTEM, value: 'pol-1' }]);
    expect(result.beneficiary).toEqual(patientRef);
    expect(result.order).toBe(1);
    expect(result.subscriberId).toBe('INS-12345');
    expect(result.period).toEqual({ start: '2024-01-01', end: '2024-12-31' });
    expect(result.payor).toEqual([{ display: 'Aetna' }]);
    expect(result.class).toEqual([
      {
        type: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/coverage-class', code: 'group' }],
        },
        value: 'GRP-999',
      },
    ]);
    expect(result.subscriber).toEqual({ display: 'John Doe' });
    expect(result.costToBeneficiary).toHaveLength(2);
    expect(result.costToBeneficiary?.[0]).toEqual({
      type: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/coverage-copay-type', code: 'copay' }],
      },
      valueMoney: { value: 25, currency: 'USD' },
    });
    expect(result.costToBeneficiary?.[1]).toEqual({
      type: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/coverage-copay-type', code: 'coinsurance' }],
      },
      valueMoney: { value: 20, currency: 'USD' },
    });
  });

  test('converts secondary policy with child subscriber', () => {
    const policy: HealthiePolicy = {
      id: 'pol-2',
      num: 'INS-67890',
      priority_type: 'secondary',
      holder_relationship: 'parent',
      holder_first: 'Jane',
      holder_last: 'Smith',
      insurance_plan: { id: 'plan2', payer_name: 'UnitedHealth' },
    };

    const result = convertHealthiePolicyToFhir(policy, patientRef);

    expect(result.order).toBe(2);
    expect(result.subscriberId).toBe('INS-67890');
    expect(result.subscriber).toEqual({ display: 'Jane Smith' });
    expect(result.payor).toEqual([{ display: 'UnitedHealth' }]);
    expect(result.period).toBeUndefined();
    expect(result.class).toBeUndefined();
    expect(result.costToBeneficiary).toBeUndefined();
  });

  test('falls back to patient as payor when no insurance_plan', () => {
    const policy: HealthiePolicy = {
      id: 'pol-3',
      num: 'INS-00001',
      priority_type: 'primary',
    };

    const result = convertHealthiePolicyToFhir(policy, patientRef);

    expect(result.payor).toEqual([patientRef]);
    expect(result.subscriber).toBeUndefined();
    expect(result.class).toBeUndefined();
  });

  test('handles policy with copay only', () => {
    const policy: HealthiePolicy = {
      id: 'pol-4',
      copay_value: 30,
    };

    const result = convertHealthiePolicyToFhir(policy, patientRef);

    expect(result.costToBeneficiary).toHaveLength(1);
    expect(result.costToBeneficiary?.[0].valueMoney).toEqual({ value: 30, currency: 'USD' });
  });

  test('handles policy with zero copay', () => {
    const policy: HealthiePolicy = {
      id: 'pol-5',
      copay_value: 0,
    };

    const result = convertHealthiePolicyToFhir(policy, patientRef);

    expect(result.costToBeneficiary).toHaveLength(1);
    expect(result.costToBeneficiary?.[0].valueMoney).toEqual({ value: 0, currency: 'USD' });
  });

  test('handles minimal policy with only id', () => {
    const policy: HealthiePolicy = { id: 'pol-6' };

    const result = convertHealthiePolicyToFhir(policy, patientRef);

    expect(result.resourceType).toBe('Coverage');
    expect(result.status).toBe('active');
    expect(result.identifier).toEqual([{ system: HEALTHIE_POLICY_ID_SYSTEM, value: 'pol-6' }]);
    expect(result.beneficiary).toEqual(patientRef);
    expect(result.order).toBeUndefined();
    expect(result.subscriberId).toBeUndefined();
    expect(result.period).toBeUndefined();
    expect(result.payor).toEqual([patientRef]);
    expect(result.class).toBeUndefined();
    expect(result.subscriber).toBeUndefined();
    expect(result.costToBeneficiary).toBeUndefined();
  });

  test('handles holder with only first name', () => {
    const policy: HealthiePolicy = {
      id: 'pol-7',
      holder_first: 'Jane',
    };

    const result = convertHealthiePolicyToFhir(policy, patientRef);
    expect(result.subscriber).toEqual({ display: 'Jane' });
  });

  test('handles holder with only last name', () => {
    const policy: HealthiePolicy = {
      id: 'pol-8',
      holder_last: 'Smith',
    };

    const result = convertHealthiePolicyToFhir(policy, patientRef);
    expect(result.subscriber).toEqual({ display: 'Smith' });
  });

  test('only sets period when at least one date exists', () => {
    const startOnly: HealthiePolicy = { id: 'pol-9', effective_start: '2024-06-01' };
    const endOnly: HealthiePolicy = { id: 'pol-10', effective_end: '2025-01-01' };

    const resultStart = convertHealthiePolicyToFhir(startOnly, patientRef);
    expect(resultStart.period).toEqual({ start: '2024-06-01', end: undefined });

    const resultEnd = convertHealthiePolicyToFhir(endOnly, patientRef);
    expect(resultEnd.period).toEqual({ start: undefined, end: '2025-01-01' });
  });
});

describe('mapPriorityType', () => {
  test('maps standard priority values', () => {
    expect(mapPriorityType('primary')).toBe(1);
    expect(mapPriorityType('secondary')).toBe(2);
    expect(mapPriorityType('tertiary')).toBe(3);
  });

  test('is case-insensitive', () => {
    expect(mapPriorityType('Primary')).toBe(1);
    expect(mapPriorityType('SECONDARY')).toBe(2);
  });

  test('returns undefined for missing or unknown values', () => {
    expect(mapPriorityType(undefined)).toBeUndefined();
    expect(mapPriorityType('quaternary')).toBeUndefined();
    expect(mapPriorityType('')).toBeUndefined();
  });
});

describe('mapHolderRelationship', () => {
  const system = 'http://terminology.hl7.org/CodeSystem/subscriber-relationship';

  test('returns undefined for missing value', () => {
    expect(mapHolderRelationship(undefined)).toBeUndefined();
  });

  test('maps standard relationship values', () => {
    expect(mapHolderRelationship('self')).toEqual({ coding: [{ system, code: 'self' }] });
    expect(mapHolderRelationship('spouse')).toEqual({ coding: [{ system, code: 'spouse' }] });
    expect(mapHolderRelationship('child')).toEqual({ coding: [{ system, code: 'child' }] });
    expect(mapHolderRelationship('parent')).toEqual({ coding: [{ system, code: 'parent' }] });
    expect(mapHolderRelationship('other')).toEqual({ coding: [{ system, code: 'other' }] });
  });

  test('maps partner-type values to common', () => {
    expect(mapHolderRelationship('common_law')).toEqual({ coding: [{ system, code: 'common' }] });
    expect(mapHolderRelationship('domestic_partner')).toEqual({ coding: [{ system, code: 'common' }] });
    expect(mapHolderRelationship('life_partner')).toEqual({ coding: [{ system, code: 'common' }] });
  });

  test('maps guardian to other', () => {
    expect(mapHolderRelationship('guardian')).toEqual({ coding: [{ system, code: 'other' }] });
  });

  test('is case-insensitive', () => {
    expect(mapHolderRelationship('Self')).toEqual({ coding: [{ system, code: 'self' }] });
    expect(mapHolderRelationship('SPOUSE')).toEqual({ coding: [{ system, code: 'spouse' }] });
  });

  test('falls back to other for unknown values', () => {
    expect(mapHolderRelationship('roommate')).toEqual({ coding: [{ system, code: 'other' }] });
  });
});

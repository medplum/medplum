// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test, vi } from 'vitest';
import { HEALTHIE_PROVIDER_ID_SYSTEM, HEALTHIE_PROVIDER_ROLE_ID_SYSTEM, NPI_SYSTEM } from './constants';
import type { HealthieProvider } from './provider';
import {
  convertHealthieProviderToPractitioner,
  convertHealthieProviderToPractitionerRole,
  fetchOrganizationMembers,
} from './provider';

vi.mock('./client', async (importOriginal) => {
  const original = (await importOriginal()) as any;
  original.HealthieClient.prototype.query = vi.fn();
  return original;
});

import { HealthieClient } from './client';

afterEach(() => {
  vi.clearAllMocks();
});

function getMockQuery(): ReturnType<typeof vi.fn> {
  return vi.mocked(HealthieClient.prototype.query);
}

const FULL_PROVIDER: HealthieProvider = {
  id: 'prov-1',
  first_name: 'Jane',
  last_name: 'Smith',
  is_active_provider: true,
  npi: '1234567890',
  license_num: 'LIC-001',
  qualifications: 'MD',
  phone_number: '555-0100',
  email: 'jane@example.com',
  specialties: [
    { id: 'spec-1', specialty: 'Cardiology', specialty_category: 'Medicine' },
    { id: 'spec-2', specialty: 'Internal Medicine', specialty_category: 'Medicine' },
  ],
  professions: [{ id: 'prof-1', profession: 'Physician', profession_category: 'Medicine' }],
  state_licenses: [
    { id: 'lic-1', state: 'CA', full_state_name: 'California' },
    { id: 'lic-2', state: 'NY', full_state_name: 'New York' },
  ],
  organization: { id: 'org-1', name: 'Test Clinic' },
};

describe('fetchOrganizationMembers', () => {
  test('returns active providers', async () => {
    getMockQuery().mockResolvedValueOnce({
      organizationMembers: [
        { id: '1', first_name: 'Dr', last_name: 'A', is_active_provider: true },
        { id: '2', first_name: 'Dr', last_name: 'B', is_active_provider: true },
      ],
    });

    const client = new HealthieClient('https://api.example.com', 'secret');
    const result = await fetchOrganizationMembers(client);
    expect(result).toHaveLength(2);
  });

  test('filters out inactive providers', async () => {
    getMockQuery().mockResolvedValueOnce({
      organizationMembers: [
        { id: '1', is_active_provider: true },
        { id: '2', is_active_provider: false },
        { id: '3', is_active_provider: true },
      ],
    });

    const client = new HealthieClient('https://api.example.com', 'secret');
    const result = await fetchOrganizationMembers(client);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id)).toEqual(['1', '3']);
  });

  test('returns empty array when null', async () => {
    getMockQuery().mockResolvedValueOnce({ organizationMembers: null });

    const client = new HealthieClient('https://api.example.com', 'secret');
    const result = await fetchOrganizationMembers(client);
    expect(result).toEqual([]);
  });

  test('returns empty array when no members', async () => {
    getMockQuery().mockResolvedValueOnce({ organizationMembers: [] });

    const client = new HealthieClient('https://api.example.com', 'secret');
    const result = await fetchOrganizationMembers(client);
    expect(result).toEqual([]);
  });
});

describe('convertHealthieProviderToPractitioner', () => {
  test('converts full provider with all fields', () => {
    const result = convertHealthieProviderToPractitioner(FULL_PROVIDER);

    expect(result.resourceType).toBe('Practitioner');
    expect(result.active).toBe(true);

    expect(result.identifier).toHaveLength(2);
    expect(result.identifier?.[0]).toEqual({ system: HEALTHIE_PROVIDER_ID_SYSTEM, value: 'prov-1' });
    expect(result.identifier?.[1]).toEqual({ system: NPI_SYSTEM, value: '1234567890' });

    expect(result.name?.[0].given).toEqual(['Jane']);
    expect(result.name?.[0].family).toBe('Smith');

    expect(result.telecom).toHaveLength(2);
    expect(result.telecom?.[0]).toEqual({ system: 'phone', value: '555-0100' });
    expect(result.telecom?.[1]).toEqual({ system: 'email', value: 'jane@example.com' });

    expect(result.qualification).toHaveLength(4);
    expect(result.qualification?.[0].code.text).toBe('Cardiology');
    expect(result.qualification?.[1].code.text).toBe('Internal Medicine');
    expect(result.qualification?.[2].code.text).toBe('License - California');
    expect(result.qualification?.[3].code.text).toBe('License - New York');
  });

  test('omits NPI when not present', () => {
    const provider: HealthieProvider = { id: 'prov-2', first_name: 'Bob' };
    const result = convertHealthieProviderToPractitioner(provider);

    expect(result.identifier).toHaveLength(1);
    expect(result.identifier?.[0].system).toBe(HEALTHIE_PROVIDER_ID_SYSTEM);
  });

  test('omits telecom when no phone or email', () => {
    const provider: HealthieProvider = { id: 'prov-3', first_name: 'Eve' };
    const result = convertHealthieProviderToPractitioner(provider);

    expect(result.telecom).toBeUndefined();
  });

  test('handles email-only telecom', () => {
    const provider: HealthieProvider = { id: 'prov-4', email: 'test@test.com' };
    const result = convertHealthieProviderToPractitioner(provider);

    expect(result.telecom).toHaveLength(1);
    expect(result.telecom?.[0].system).toBe('email');
  });

  test('handles phone-only telecom', () => {
    const provider: HealthieProvider = { id: 'prov-5', phone_number: '555-0000' };
    const result = convertHealthieProviderToPractitioner(provider);

    expect(result.telecom).toHaveLength(1);
    expect(result.telecom?.[0].system).toBe('phone');
  });

  test('returns undefined name when no first or last name', () => {
    const provider: HealthieProvider = { id: 'prov-6' };
    const result = convertHealthieProviderToPractitioner(provider);

    expect(result.name).toBeUndefined();
  });

  test('handles first_name only', () => {
    const provider: HealthieProvider = { id: 'prov-7', first_name: 'Alice' };
    const result = convertHealthieProviderToPractitioner(provider);

    expect(result.name?.[0].given).toEqual(['Alice']);
    expect(result.name?.[0].family).toBeUndefined();
  });

  test('handles last_name only', () => {
    const provider: HealthieProvider = { id: 'prov-8', last_name: 'Jones' };
    const result = convertHealthieProviderToPractitioner(provider);

    expect(result.name?.[0].given).toBeUndefined();
    expect(result.name?.[0].family).toBe('Jones');
  });

  test('defaults active to true when is_active_provider is undefined', () => {
    const provider: HealthieProvider = { id: 'prov-9' };
    const result = convertHealthieProviderToPractitioner(provider);

    expect(result.active).toBe(true);
  });

  test('skips specialties with no specialty name', () => {
    const provider: HealthieProvider = {
      id: 'prov-10',
      specialties: [{ id: 'spec-1' }, { id: 'spec-2', specialty: 'Cardiology' }],
    };
    const result = convertHealthieProviderToPractitioner(provider);

    expect(result.qualification).toHaveLength(1);
    expect(result.qualification?.[0].code.text).toBe('Cardiology');
  });

  test('skips state licenses with no state', () => {
    const provider: HealthieProvider = {
      id: 'prov-11',
      state_licenses: [{ id: 'lic-1' }, { id: 'lic-2', state: 'TX', full_state_name: 'Texas' }],
    };
    const result = convertHealthieProviderToPractitioner(provider);

    expect(result.qualification).toHaveLength(1);
    expect(result.qualification?.[0].code.text).toBe('License - Texas');
  });

  test('falls back to state abbreviation when full_state_name missing', () => {
    const provider: HealthieProvider = {
      id: 'prov-12',
      state_licenses: [{ id: 'lic-1', state: 'FL' }],
    };
    const result = convertHealthieProviderToPractitioner(provider);

    expect(result.qualification?.[0].code.text).toBe('License - FL');
  });

  test('omits license_num from qualification when not present', () => {
    const provider: HealthieProvider = {
      id: 'prov-13',
      state_licenses: [{ id: 'lic-1', state: 'CA', full_state_name: 'California' }],
    };
    const result = convertHealthieProviderToPractitioner(provider);

    expect(result.qualification?.[0].identifier).toBeUndefined();
  });

  test('includes license_num on state license qualifications', () => {
    const provider: HealthieProvider = {
      id: 'prov-14',
      license_num: 'ABC123',
      state_licenses: [{ id: 'lic-1', state: 'CA', full_state_name: 'California' }],
    };
    const result = convertHealthieProviderToPractitioner(provider);

    expect(result.qualification?.[0].identifier?.[0].value).toBe('ABC123');
  });

  test('omits license_num when multiple state licenses exist', () => {
    const provider: HealthieProvider = {
      id: 'prov-14b',
      license_num: 'ABC123',
      state_licenses: [
        { id: 'lic-1', state: 'CA', full_state_name: 'California' },
        { id: 'lic-2', state: 'NY', full_state_name: 'New York' },
      ],
    };
    const result = convertHealthieProviderToPractitioner(provider);

    expect(result.qualification).toHaveLength(2);
    expect(result.qualification?.[0].identifier).toBeUndefined();
    expect(result.qualification?.[1].identifier).toBeUndefined();
  });

  test('returns undefined qualification when no specialties or licenses', () => {
    const provider: HealthieProvider = { id: 'prov-15' };
    const result = convertHealthieProviderToPractitioner(provider);

    expect(result.qualification).toBeUndefined();
  });

  test('specialty coding uses correct system and code', () => {
    const provider: HealthieProvider = {
      id: 'prov-16',
      specialties: [{ id: 'spec-99', specialty: 'Dermatology' }],
    };
    const result = convertHealthieProviderToPractitioner(provider);

    const coding = result.qualification?.[0].code.coding?.[0];
    expect(coding?.system).toBe(`${HEALTHIE_PROVIDER_ID_SYSTEM}/specialty`);
    expect(coding?.code).toBe('spec-99');
    expect(coding?.display).toBe('Dermatology');
  });
});

describe('convertHealthieProviderToPractitionerRole', () => {
  const practitionerIdentifier = { system: HEALTHIE_PROVIDER_ID_SYSTEM, value: 'prov-1' };

  test('converts full provider to PractitionerRole', () => {
    const result = convertHealthieProviderToPractitionerRole(FULL_PROVIDER, practitionerIdentifier);

    expect(result.resourceType).toBe('PractitionerRole');
    expect(result.identifier?.[0]).toEqual({ system: HEALTHIE_PROVIDER_ROLE_ID_SYSTEM, value: 'prov-1' });
    expect(result.active).toBe(true);
    expect(result.practitioner?.identifier).toEqual(practitionerIdentifier);

    expect(result.specialty).toHaveLength(2);
    expect(result.specialty?.[0].text).toBe('Cardiology');
    expect(result.specialty?.[1].text).toBe('Internal Medicine');

    expect(result.code).toHaveLength(1);
    expect(result.code?.[0].text).toBe('Physician');
  });

  test('handles provider without specialties', () => {
    const provider: HealthieProvider = { id: 'prov-2' };
    const result = convertHealthieProviderToPractitionerRole(provider, practitionerIdentifier);

    expect(result.specialty).toBeUndefined();
  });

  test('handles provider without professions', () => {
    const provider: HealthieProvider = { id: 'prov-3' };
    const result = convertHealthieProviderToPractitionerRole(provider, practitionerIdentifier);

    expect(result.code).toBeUndefined();
  });

  test('sets active false for inactive provider', () => {
    const provider: HealthieProvider = { id: 'prov-4', is_active_provider: false };
    const result = convertHealthieProviderToPractitionerRole(provider, practitionerIdentifier);

    expect(result.active).toBe(false);
  });

  test('defaults active to true', () => {
    const provider: HealthieProvider = { id: 'prov-5' };
    const result = convertHealthieProviderToPractitionerRole(provider, practitionerIdentifier);

    expect(result.active).toBe(true);
  });

  test('skips specialties with no specialty name', () => {
    const provider: HealthieProvider = {
      id: 'prov-6',
      specialties: [{ id: 's1' }, { id: 's2', specialty: 'Nutrition' }],
    };
    const result = convertHealthieProviderToPractitionerRole(provider, practitionerIdentifier);

    expect(result.specialty).toHaveLength(1);
    expect(result.specialty?.[0].text).toBe('Nutrition');
  });

  test('specialty coding uses correct system', () => {
    const provider: HealthieProvider = {
      id: 'prov-7',
      specialties: [{ id: 'spec-42', specialty: 'Pediatrics' }],
    };
    const result = convertHealthieProviderToPractitionerRole(provider, practitionerIdentifier);

    const coding = result.specialty?.[0].coding?.[0];
    expect(coding?.system).toBe(`${HEALTHIE_PROVIDER_ID_SYSTEM}/specialty`);
    expect(coding?.code).toBe('spec-42');
    expect(coding?.display).toBe('Pediatrics');
  });

  test('skips professions with no profession name', () => {
    const provider: HealthieProvider = {
      id: 'prov-8',
      professions: [{ id: 'p1' }, { id: 'p2', profession: 'Nurse Practitioner' }],
    };
    const result = convertHealthieProviderToPractitionerRole(provider, practitionerIdentifier);

    expect(result.code).toHaveLength(1);
    expect(result.code?.[0].text).toBe('Nurse Practitioner');
  });
});

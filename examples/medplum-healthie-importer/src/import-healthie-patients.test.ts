import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { Bot, Bundle, Reference, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { handler } from './import-healthie-patients';
import { HealthieClient } from './healthie/client';

vi.mock('./healthie/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('./healthie/client')>();
  original.HealthieClient.prototype.query = vi.fn();
  return original;
});

// Mock data
const MOCK_PATIENT_RESPONSE = {
  users: [
    {
      id: '2494091',
      active: true,
      name: 'Example Client',
      first_name: 'Example',
      last_name: 'Client',
      phone_number: null,
      gender: null,
      gender_identity: null,
      sex: null,
      sexual_orientation: null,
      locations: [],
    },
    {
      id: '2498842',
      active: true,
      name: 'Test Patient1',
      first_name: 'Test',
      last_name: 'Patient1',
      phone_number: null,
      gender: null,
      gender_identity: null,
      sex: null,
      sexual_orientation: null,
      locations: [],
    },
    {
      id: '2498847',
      active: true,
      name: 'Test Patient2',
      first_name: 'Test',
      last_name: 'Patient2',
      phone_number: null,
      gender: null,
      gender_identity: null,
      sex: null,
      sexual_orientation: null,
      locations: [],
    },
    {
      id: '2501776',
      active: true,
      name: 'Test Patient3',
      first_name: 'Test',
      last_name: 'Patient3',
      phone_number: null,
      gender: null,
      gender_identity: null,
      sex: null,
      sexual_orientation: null,
      locations: [],
    },
    {
      id: '2501783',
      active: true,
      name: 'Test Patient4',
      first_name: 'Test',
      last_name: 'Patient4',
      phone_number: '8231720938',
      gender: 'Female',
      gender_identity: '',
      sex: 'Female',
      sexual_orientation: 'Bisexual',
      locations: [
        {
          zip: '12345',
          line1: '123 Main St.',
          line2: '',
          to_oneline: '123 Main St., New York, NM 12345',
          city: 'New York',
          country: 'US',
          cursor: 'eyJrIjpbIjYwOTMxNyJdfQ==',
          state: 'NM',
        },
      ],
    },
  ],
};

const MOCK_MEDICATION_RESPONSE = {
  medications: [
    {
      id: '42030',
      name: 'Lexapro Oral Tablet',
      active: false,
      directions: null,
      dosage: '10 MG',
      code: null,
      start_date: '2025-04-01 00:00:00 -0700',
      end_date: '2025-04-02 00:00:00 -0700',
      comment: null,
      created_at: '2025-04-08 15:33:09 -0700',
      frequency: null,
      mirrored: false,
      requires_consolidation: false,
      route: null,
      updated_at: '2025-04-08 15:33:09 -0700',
      user_id: '2498842',
    },
    {
      id: '42029',
      name: 'Tylenol 8 Hour Arthritis Pain Oral Tablet Extended Release',
      active: true,
      directions: null,
      dosage: '650 MG',
      code: null,
      start_date: '2025-04-01 00:00:00 -0700',
      end_date: null,
      comment: 'Comment on Tylenol',
      created_at: '2025-04-08 15:22:38 -0700',
      frequency: null,
      mirrored: false,
      requires_consolidation: false,
      route: null,
      updated_at: '2025-04-08 16:08:57 -0700',
      user_id: '2498842',
    },
  ],
};

describe('fetch-patients handler', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    // Mock only the query method for patient data
    vi.mocked(HealthieClient.prototype.query)
      .mockResolvedValueOnce(MOCK_PATIENT_RESPONSE)
      .mockResolvedValueOnce(MOCK_MEDICATION_RESPONSE)
      .mockResolvedValue({ medications: [] });
  });

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('syncs patient demographics correctly', async () => {
    const event = {
      input: {},
      contentType: 'application/json',
      secrets: {
        HEALTHIE_API_URL: { name: 'HEALTHIE_API_URL', valueString: 'https://api.example.com' },
        HEALTHIE_CLIENT_SECRET: { name: 'HEALTHIE_CLIENT_SECRET', valueString: 'test-secret' },
      },
      bot: { reference: 'Bot/test-bot' } as Reference<Bot>,
    };

    await handler(medplum, event);

    // Test patient with minimal data
    const basicPatient = await medplum.searchResources('Patient', {
      identifier: 'https://www.gethealthie.com/userId|2494091',
    });
    expect(basicPatient.length).toBe(1);
    expect(basicPatient[0].name?.[0].given).toEqual(['Example']);
    expect(basicPatient[0].name?.[0].family).toBe('Client');
    expect(basicPatient[0].active).toBeUndefined();
    expect(basicPatient[0].address).toBeUndefined();

    // Test patient with complete demographic data
    const complexPatient = await medplum.searchResources('Patient', {
      identifier: 'https://www.gethealthie.com/userId|2501783',
    });
    expect(complexPatient.length).toBe(1);
    const patient = complexPatient[0];

    // Verify complete demographic data
    expect(patient.name?.[0].given).toEqual(['Test']);
    expect(patient.name?.[0].family).toBe('Patient4');
    expect(patient.telecom?.[0].value).toBe('8231720938');
    expect(patient.telecom?.[0].system).toBe('phone');
    expect(patient.gender).toBe('female');
    expect(patient.address?.[0].line).toEqual(['123 Main St.']);
    expect(patient.address?.[0].city).toBe('New York');
    expect(patient.address?.[0].state).toBe('NM');
    expect(patient.address?.[0].postalCode).toBe('12345');
    expect(patient.address?.[0].country).toBe('US');
  });

  test('syncs medications correctly for multiple patients', async () => {
    const event = {
      input: {},
      contentType: 'application/json',
      secrets: {
        HEALTHIE_API_URL: { name: 'HEALTHIE_API_URL', valueString: 'https://api.example.com' },
        HEALTHIE_CLIENT_SECRET: { name: 'HEALTHIE_CLIENT_SECRET', valueString: 'test-secret' },
      },
      bot: { reference: 'Bot/test-bot' } as Reference<Bot>,
    };

    await handler(medplum, event);

    // Test active medication
    const activeMedications = await medplum.searchResources('MedicationRequest', {
      identifier: 'https://www.gethealthie.com/medicationId|42029',
    });
    expect(activeMedications.length).toBe(1);
    const activeMed = activeMedications[0];

    expect(activeMed.status).toBe('active');
    expect(activeMed.medicationCodeableConcept?.text).toBe(
      'Tylenol 8 Hour Arthritis Pain Oral Tablet Extended Release'
    );
    expect(activeMed.dosageInstruction?.[0].doseAndRate?.[0].doseQuantity?.value).toBe(650);
    expect(activeMed.dosageInstruction?.[0].doseAndRate?.[0].doseQuantity?.unit).toBe('MG');
    expect(activeMed.note?.[0].text).toBe('Comment on Tylenol');

    // Test inactive medication
    const inactiveMedications = await medplum.searchResources('MedicationRequest', {
      identifier: 'https://www.gethealthie.com/medicationId|42030',
    });
    expect(inactiveMedications.length).toBe(1);
    const inactiveMed = inactiveMedications[0];

    expect(inactiveMed.status).toBe('unknown');
    expect(inactiveMed.medicationCodeableConcept?.text).toBe('Lexapro Oral Tablet');
    expect(inactiveMed.dosageInstruction?.[0].doseAndRate?.[0].doseQuantity?.value).toBe(10);
    expect(inactiveMed.dosageInstruction?.[0].doseAndRate?.[0].doseQuantity?.unit).toBe('MG');
  });

  test('handles missing secrets', async () => {
    const event = {
      input: {},
      contentType: 'application/json',
      secrets: {},
      bot: { reference: 'Bot/test-bot' } as Reference<Bot>,
    };
    await expect(handler(medplum, event)).rejects.toThrow('HEALTHIE_API_URL must be set');
  });

  test('handles empty patient list', async () => {
    const event = {
      input: {},
      contentType: 'application/json',
      secrets: {
        HEALTHIE_API_URL: { name: 'HEALTHIE_API_URL', valueString: 'https://api.example.com' },
        HEALTHIE_CLIENT_SECRET: { name: 'HEALTHIE_CLIENT_SECRET', valueString: 'test-secret' },
      },
      bot: { reference: 'Bot/test-bot' } as Reference<Bot>,
    };

    vi.mocked(HealthieClient.prototype.query).mockReset().mockResolvedValue({ users: [] });

    await handler(medplum, event);
    const searchRequest = await medplum.search('Patient', 'identifier=https://www.gethealthie.com/userId|');
    expect(searchRequest.entry?.length ?? 0).toBe(0);
  });
});

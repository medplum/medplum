// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bot, Bundle, Reference, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { HealthieClient } from './healthie/client';
import { handler } from './import-healthie-patients';

vi.mock('./healthie/client', async (importOriginal) => {
  const original = (await importOriginal()) as any;
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

const MOCK_PROVIDER_RESPONSE = {
  organizationMembers: [
    {
      id: 'prov-1',
      first_name: 'Dr',
      last_name: 'Smith',
      is_active_provider: true,
      npi: '1234567890',
      email: 'dr.smith@example.com',
      specialties: [{ id: 'spec-1', specialty: 'Internal Medicine' }],
      professions: [{ id: 'prof-1', profession: 'Physician' }],
      state_licenses: [],
    },
  ],
};

const MOCK_DOCUMENT_RESPONSE = {
  documents: [
    {
      id: 'doc-100',
      display_name: 'Lab Report.pdf',
      description: 'Annual blood work',
      file_content_type: 'application/pdf',
      expiring_url: 'https://s3.example.com/doc-100.pdf?token=abc',
      rel_user_id: '2498842',
      created_at: '2025-04-10T12:00:00Z',
      updated_at: '2025-04-10T12:00:00Z',
    },
  ],
};

describe('fetch-patients handler', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  // Handler call sequence:
  // 1. fetchOrganizationMembers (providers)
  // 2. fetchHealthiePatientIds (patient IDs)
  // Per patient:
  //   3. fetchHealthiePatients (patient details)
  //   4. fetchMedications
  //   5. fetchAllergySensitivities
  //   6. fetchHealthieFormAnswerGroups
  //   7. fetchPolicies
  //   8. fetchDocuments
  function setupMocks(options?: { withDietitianId?: boolean; withDocuments?: boolean }): void {
    const mockQuery = vi.mocked(HealthieClient.prototype.query);
    mockQuery.mockReset();

    // 1. fetchOrganizationMembers (providers)
    mockQuery.mockResolvedValueOnce(MOCK_PROVIDER_RESPONSE);

    // 2. fetchHealthiePatientIds
    mockQuery.mockResolvedValueOnce({
      users: [
        { id: '2494091', updated_at: '2025-01-01T00:00:00Z', cursor: 'cursor1' },
        { id: '2498842', updated_at: '2025-01-01T00:00:00Z', cursor: 'cursor2' },
        { id: '2501783', updated_at: '2025-01-01T00:00:00Z', cursor: 'cursor3' },
      ],
    });

    // Patient 2494091 (basic patient, no clinical data)
    mockQuery.mockResolvedValueOnce({ users: [MOCK_PATIENT_RESPONSE.users[0]] });
    mockQuery.mockResolvedValueOnce({ medications: [] });
    mockQuery.mockResolvedValueOnce({ user: { allergy_sensitivities: [] } });
    mockQuery.mockResolvedValueOnce({ formAnswerGroups: [] });
    mockQuery.mockResolvedValueOnce({ user: { policies: [] } });
    mockQuery.mockResolvedValueOnce({ documents: [] });

    // Patient 2498842 (has medications and optionally documents)
    mockQuery.mockResolvedValueOnce({ users: [MOCK_PATIENT_RESPONSE.users[1]] });
    mockQuery.mockResolvedValueOnce(MOCK_MEDICATION_RESPONSE);
    mockQuery.mockResolvedValueOnce({ user: { allergy_sensitivities: [] } });
    mockQuery.mockResolvedValueOnce({ formAnswerGroups: [] });
    mockQuery.mockResolvedValueOnce({ user: { policies: [] } });
    mockQuery.mockResolvedValueOnce(options?.withDocuments ? MOCK_DOCUMENT_RESPONSE : { documents: [] });

    // Patient 2501783 (full demographics, optionally with dietitian)
    const patient4Data = options?.withDietitianId
      ? { ...MOCK_PATIENT_RESPONSE.users[4], dietitian_id: 'prov-1' }
      : MOCK_PATIENT_RESPONSE.users[4];
    mockQuery.mockResolvedValueOnce({ users: [patient4Data] });
    mockQuery.mockResolvedValueOnce({ medications: [] });
    mockQuery.mockResolvedValueOnce({ user: { allergy_sensitivities: [] } });
    mockQuery.mockResolvedValueOnce({ formAnswerGroups: [] });
    mockQuery.mockResolvedValueOnce({ user: { policies: [] } });
    mockQuery.mockResolvedValueOnce({ documents: [] });
  }

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  const DEFAULT_EVENT = {
    input: {},
    contentType: 'application/json',
    secrets: {
      HEALTHIE_API_URL: { name: 'HEALTHIE_API_URL', valueString: 'https://api.example.com' },
      HEALTHIE_CLIENT_SECRET: { name: 'HEALTHIE_CLIENT_SECRET', valueString: 'test-secret' },
    },
    bot: { reference: 'Bot/test-bot' } as Reference<Bot>,
  };

  test('syncs patient demographics correctly', async () => {
    setupMocks();

    await handler(medplum, DEFAULT_EVENT);

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
    setupMocks();

    await handler(medplum, DEFAULT_EVENT);

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

  test('syncs providers as Practitioner and PractitionerRole', async () => {
    setupMocks();

    await handler(medplum, DEFAULT_EVENT);

    const practitioners = await medplum.searchResources('Practitioner', {
      identifier: 'https://www.gethealthie.com/providerId|prov-1',
    });
    expect(practitioners.length).toBe(1);
    const practitioner = practitioners[0];

    expect(practitioner.name?.[0].given).toEqual(['Dr']);
    expect(practitioner.name?.[0].family).toBe('Smith');
    expect(practitioner.active).toBe(true);
    expect(practitioner.identifier).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ system: 'http://hl7.org/fhir/sid/us-npi', value: '1234567890' }),
      ])
    );

    const roles = await medplum.searchResources('PractitionerRole', {
      identifier: 'https://www.gethealthie.com/providerRoleId|prov-1',
    });
    expect(roles.length).toBe(1);
    expect(roles[0].active).toBe(true);
    expect(roles[0].specialty?.[0].text).toBe('Internal Medicine');
    expect(roles[0].code?.[0].text).toBe('Physician');
  });

  test('sets generalPractitioner when patient has dietitian_id', async () => {
    setupMocks({ withDietitianId: true });

    await handler(medplum, DEFAULT_EVENT);

    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://www.gethealthie.com/userId|2501783',
    });
    expect(patients.length).toBe(1);
    expect(patients[0].generalPractitioner).toEqual([
      {
        identifier: { system: 'https://www.gethealthie.com/providerId', value: 'prov-1' },
      },
    ]);
  });

  test('does not set generalPractitioner when no dietitian_id', async () => {
    setupMocks();

    await handler(medplum, DEFAULT_EVENT);

    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://www.gethealthie.com/userId|2501783',
    });
    expect(patients.length).toBe(1);
    expect(patients[0].generalPractitioner).toBeUndefined();
  });

  test('syncs documents as DocumentReference', async () => {
    setupMocks({ withDocuments: true });

    const mockArrayBuffer = new TextEncoder().encode('pdf content').buffer;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: () => Promise.resolve(mockArrayBuffer),
    } as Response);

    await handler(medplum, DEFAULT_EVENT);

    const docRefs = await medplum.searchResources('DocumentReference', {
      identifier: 'https://www.gethealthie.com/documentId|doc-100',
    });
    expect(docRefs.length).toBe(1);
    const docRef = docRefs[0];

    expect(docRef.status).toBe('current');
    expect(docRef.description).toBe('Annual blood work');
    expect(docRef.content[0].attachment.contentType).toBe('application/pdf');
    expect(docRef.content[0].attachment.title).toBe('Lab Report.pdf');
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

  test('handles missing CLIENT_SECRET', async () => {
    const event = {
      input: {},
      contentType: 'application/json',
      secrets: {
        HEALTHIE_API_URL: { name: 'HEALTHIE_API_URL', valueString: 'https://api.example.com' },
      },
      bot: { reference: 'Bot/test-bot' } as Reference<Bot>,
    };
    await expect(handler(medplum, event)).rejects.toThrow('HEALTHIE_CLIENT_SECRET must be set');
  });

  test('handles empty patient list', async () => {
    const mockQuery = vi.mocked(HealthieClient.prototype.query);
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ organizationMembers: [] });
    mockQuery.mockResolvedValueOnce({ users: [] });

    await handler(medplum, DEFAULT_EVENT);
    const searchRequest = await medplum.search('Patient', 'identifier=https://www.gethealthie.com/userId|');
    expect(searchRequest.entry?.length ?? 0).toBe(0);
  });

  test('continues processing when one patient fails', async () => {
    const mockQuery = vi.mocked(HealthieClient.prototype.query);
    mockQuery.mockReset();

    // Providers
    mockQuery.mockResolvedValueOnce(MOCK_PROVIDER_RESPONSE);

    // Patient IDs — two patients
    mockQuery.mockResolvedValueOnce({
      users: [
        { id: '2494091', updated_at: '2025-01-01T00:00:00Z', cursor: 'cursor1' },
        { id: '2498842', updated_at: '2025-01-01T00:00:00Z', cursor: 'cursor2' },
      ],
    });

    // Patient 2494091 — fetchHealthiePatients throws
    mockQuery.mockRejectedValueOnce(new Error('Network error'));

    // Patient 2498842 — succeeds
    mockQuery.mockResolvedValueOnce({ users: [MOCK_PATIENT_RESPONSE.users[1]] });
    mockQuery.mockResolvedValueOnce({ medications: [] });
    mockQuery.mockResolvedValueOnce({ user: { allergy_sensitivities: [] } });
    mockQuery.mockResolvedValueOnce({ formAnswerGroups: [] });
    mockQuery.mockResolvedValueOnce({ user: { policies: [] } });
    mockQuery.mockResolvedValueOnce({ documents: [] });

    await handler(medplum, DEFAULT_EVENT);

    // First patient should fail, second should succeed
    const patient1 = await medplum.searchResources('Patient', {
      identifier: 'https://www.gethealthie.com/userId|2494091',
    });
    expect(patient1.length).toBe(0);

    const patient2 = await medplum.searchResources('Patient', {
      identifier: 'https://www.gethealthie.com/userId|2498842',
    });
    expect(patient2.length).toBe(1);
  });
});

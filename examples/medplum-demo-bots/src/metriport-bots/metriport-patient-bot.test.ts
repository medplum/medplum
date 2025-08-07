// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MetriportMedicalApi } from '@metriport/api-sdk';
import {
  buildMetriportPatientPayload,
  createMetriportPatient,
  findMatchingMetriportPatient,
  getMetriportFacilityIdFromMedplumPatient,
  handler,
  ValidatedPatientData,
  validatePatientResource,
} from './metriport-patient-bot';
import {
  CareFacilityMedplumOrganization,
  JaneSmithMedplumPatient,
  JaneSmithMetriportPatient,
} from './metriport-test-data';

vi.mock('@metriport/api-sdk', () => ({
  MetriportMedicalApi: vi.fn(),
  USState: {
    AZ: 'AZ',
    CA: 'CA',
  },
}));

describe('Metriport Patient Bot', () => {
  const bot = { reference: 'Bot/123' };
  const contentType = 'application/fhir+json';
  const secrets = { METRIPORT_API_KEY: { name: 'METRIPORT_API_KEY', valueString: 'test-metriport-api-key' } };

  let medplum: MockClient;

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    medplum = new MockClient();
  });

  test('throws error when missing METRIPORT_API_KEY', async () => {
    await expect(handler(medplum, { bot, input: JaneSmithMedplumPatient, contentType, secrets: {} })).rejects.toThrow(
      'Missing METRIPORT_API_KEY'
    );
  });

  test('throws error if Metriport.matchPatient fails', async () => {
    const error = new Error('Network Error');

    vi.mocked(MetriportMedicalApi).mockImplementation(
      () =>
        ({
          matchPatient: vi.fn().mockRejectedValue(error),
        }) as Partial<MetriportMedicalApi> as MetriportMedicalApi
    );

    await expect(handler(medplum, { bot, input: JaneSmithMedplumPatient, contentType, secrets })).rejects.toThrow(
      new Error(`Error matching patient in Metriport: Network Error`, {
        cause: error,
      })
    );
  });
});

describe('validatePatientResource', () => {
  const requiredFields = [
    { field: 'name', test: () => ({ ...JaneSmithMedplumPatient, name: undefined }), message: 'Missing first name' },
    {
      field: 'name.given',
      test: () => ({ ...JaneSmithMedplumPatient, name: [{ family: 'Smith' }] }),
      message: 'Missing first name',
    },
    {
      field: 'name.family',
      test: () => ({ ...JaneSmithMedplumPatient, name: [{ given: ['Jane'] }] }),
      message: 'Missing last name',
    },
    {
      field: 'birthDate',
      test: () => ({ ...JaneSmithMedplumPatient, birthDate: undefined }),
      message: 'Missing date of birth',
    },
    { field: 'gender', test: () => ({ ...JaneSmithMedplumPatient, gender: undefined }), message: 'Missing gender' },
    {
      field: 'address',
      test: () => ({ ...JaneSmithMedplumPatient, address: undefined }),
      message: 'Missing address information',
    },
    {
      field: 'address.line',
      test: () => ({
        ...JaneSmithMedplumPatient,
        address: [{ city: 'Phoenix', state: 'AZ', postalCode: '85300' }],
      }),
      message: 'Missing address information',
    },
    {
      field: 'address.city',
      test: () => ({
        ...JaneSmithMedplumPatient,
        address: [{ line: ['123 Arsenal St'], state: 'AZ', postalCode: '85300' }],
      }),
      message: 'Missing address information',
    },
    {
      field: 'address.state',
      test: () => ({
        ...JaneSmithMedplumPatient,
        address: [{ line: ['123 Arsenal St'], city: 'Phoenix', postalCode: '85300' }],
      }),
      message: 'Missing address information',
    },
    {
      field: 'address.postalCode',
      test: () => ({
        ...JaneSmithMedplumPatient,
        address: [{ line: ['123 Arsenal St'], city: 'Phoenix', state: 'AZ' }],
      }),
      message: 'Missing address information',
    },
  ];

  requiredFields.forEach(({ field, test, message }) => {
    it(`should throw error when ${field} is missing`, () => {
      expect(() => validatePatientResource(test())).toThrow(message);
    });
  });

  test('validates patient with all fields present', () => {
    const answers = validatePatientResource(JaneSmithMedplumPatient);

    expect(answers).toStrictEqual({
      firstName: 'Jane',
      lastName: 'Smith',
      dob: '1996-02-10',
      genderAtBirth: 'female',
      addressLine1: '123 Arsenal St',
      city: 'Phoenix',
      state: 'AZ',
      zip: '85300',
      phone: '555-555-5555',
      email: 'jane.smith@example.com',
    });
  });

  test('validates patient with only required fields', () => {
    const minimalPatient = { ...JaneSmithMedplumPatient, telecom: undefined };

    const answers = validatePatientResource(minimalPatient);

    expect(answers).toStrictEqual({
      firstName: 'Jane',
      lastName: 'Smith',
      dob: '1996-02-10',
      genderAtBirth: 'female',
      addressLine1: '123 Arsenal St',
      city: 'Phoenix',
      state: 'AZ',
      zip: '85300',
      phone: undefined,
      email: undefined,
    });
  });
});

describe('getMetriportFacilityIdFromMedplumPatient', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    medplum = new MockClient();
  });

  test('successfully retrieves facility ID', async () => {
    const organization = await medplum.createResource(CareFacilityMedplumOrganization);
    const patient = await medplum.createResource({
      ...JaneSmithMedplumPatient,
      managingOrganization: createReference(organization),
    });

    const facilityId = await getMetriportFacilityIdFromMedplumPatient(medplum, patient);

    expect(facilityId).toBe(CareFacilityMedplumOrganization.identifier?.[1].value);
  });

  test('returns undefined when patient is missing managingOrganization', async () => {
    const patient = await medplum.createResource(JaneSmithMedplumPatient);
    const facilityId = await getMetriportFacilityIdFromMedplumPatient(medplum, patient);
    expect(facilityId).toBeUndefined();
  });

  test('returns undefined when managingOrganization is missing identifier', async () => {
    const organization = await medplum.createResource({
      ...CareFacilityMedplumOrganization,
      identifier: undefined,
    });
    const patient = await medplum.createResource({
      ...JaneSmithMedplumPatient,
      managingOrganization: createReference(organization),
    });
    const facilityId = await getMetriportFacilityIdFromMedplumPatient(medplum, patient);
    expect(facilityId).toBeUndefined();
  });
});

describe('buildMetriportPatientPayload', () => {
  const patientData: ValidatedPatientData = {
    firstName: 'Jane',
    lastName: 'Smith',
    dob: '1996-02-10',
    genderAtBirth: 'female',
    addressLine1: '123 Arsenal St',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85300',
    phone: '555-555-5555',
    email: 'jane.smith@example.com',
  };

  const expectedBasePayload = {
    firstName: 'Jane',
    lastName: 'Smith',
    dob: '1996-02-10',
    genderAtBirth: 'F',
    address: [{ addressLine1: '123 Arsenal St', city: 'Phoenix', state: 'AZ', zip: '85300', country: 'USA' }],
    contact: [{ phone: '555-555-5555', email: 'jane.smith@example.com' }],
  };

  test('returns Demographics when called without medplumPatientId', () => {
    const result = buildMetriportPatientPayload(patientData);
    expect(result).toStrictEqual(expectedBasePayload);
  });

  test('returns PatientCreate when called with medplumPatientId', () => {
    const medplumPatientId = '123';
    const result = buildMetriportPatientPayload(patientData, medplumPatientId);
    expect(result).toStrictEqual({ ...expectedBasePayload, externalId: medplumPatientId });
  });

  test('handles missing optional fields', () => {
    const minimalPatientData: ValidatedPatientData = {
      firstName: 'Jane',
      lastName: 'Smith',
      dob: '1996-02-10',
      genderAtBirth: 'female',
      addressLine1: '123 Arsenal St',
      city: 'Phoenix',
      state: 'AZ',
      zip: '85300',
    };

    const result = buildMetriportPatientPayload(minimalPatientData);
    expect(result).toStrictEqual({
      ...expectedBasePayload,
      contact: [{ phone: undefined, email: undefined }],
    });
  });

  test('maps gender correctly', () => {
    const genderMappings = [
      { input: 'male', expected: 'M' },
      { input: 'female', expected: 'F' },
      { input: 'other', expected: 'O' },
      { input: 'unknown', expected: 'U' },
    ];

    genderMappings.forEach(({ input, expected }) => {
      const testData = { ...patientData, genderAtBirth: input };
      const result = buildMetriportPatientPayload(testData);
      expect(result.genderAtBirth).toStrictEqual(expected);
    });
  });
});

describe('findMatchingMetriportPatient', () => {
  let mockMetriport: MetriportMedicalApi;

  const patientData: ValidatedPatientData = {
    firstName: 'Jane',
    lastName: 'Smith',
    dob: '1996-02-10',
    genderAtBirth: 'female',
    addressLine1: '123 Arsenal St',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85300',
    phone: '555-555-5555',
    email: 'jane.smith@example.com',
  };
  const matchPatientCalledWith = {
    firstName: 'Jane',
    lastName: 'Smith',
    dob: '1996-02-10',
    genderAtBirth: 'F',
    address: [{ addressLine1: '123 Arsenal St', city: 'Phoenix', state: 'AZ', zip: '85300', country: 'USA' }],
    contact: [{ phone: '555-555-5555', email: 'jane.smith@example.com' }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMetriport = {
      matchPatient: vi.fn().mockImplementation(() => Promise.resolve()),
    } as unknown as MetriportMedicalApi;
  });

  test('successfully matches patient', async () => {
    mockMetriport.matchPatient = vi.fn().mockResolvedValueOnce(JaneSmithMetriportPatient);

    const result = await findMatchingMetriportPatient(mockMetriport, patientData);

    expect(result).toEqual(JaneSmithMetriportPatient);
    expect(mockMetriport.matchPatient).toHaveBeenCalledWith(matchPatientCalledWith);
  });

  test('handles no match', async () => {
    mockMetriport.matchPatient = vi.fn().mockResolvedValueOnce(undefined);

    const result = await findMatchingMetriportPatient(mockMetriport, patientData);

    expect(result).toBeUndefined();
    expect(mockMetriport.matchPatient).toHaveBeenCalledWith(matchPatientCalledWith);
  });

  test('handles Metriport API error', async () => {
    const error = new Error('API Error');
    mockMetriport.matchPatient = vi.fn().mockRejectedValueOnce(error);

    await expect(findMatchingMetriportPatient(mockMetriport, patientData)).rejects.toThrow(
      'Error matching patient in Metriport: API Error'
    );
  });
});

describe('createMetriportPatient', () => {
  let mockMetriport: MetriportMedicalApi;

  const patientData: ValidatedPatientData = {
    firstName: 'Jane',
    lastName: 'Smith',
    dob: '1996-02-10',
    genderAtBirth: 'female',
    addressLine1: '123 Arsenal St',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85300',
    phone: '555-555-5555',
    email: 'jane.smith@example.com',
  };

  const facilityId = '0195d964-d166-7226-8912-76934c23c140';
  const medplumPatientId = 'Patient/123';

  const expectedCreatePayload = {
    firstName: 'Jane',
    lastName: 'Smith',
    dob: '1996-02-10',
    genderAtBirth: 'F',
    address: [{ addressLine1: '123 Arsenal St', city: 'Phoenix', state: 'AZ', zip: '85300', country: 'USA' }],
    contact: [{ phone: '555-555-5555', email: 'jane.smith@example.com' }],
    externalId: medplumPatientId,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMetriport = {
      createPatient: vi.fn().mockImplementation(() => Promise.resolve()),
    } as unknown as MetriportMedicalApi;
  });

  test('successfully creates patient', async () => {
    mockMetriport.createPatient = vi.fn().mockResolvedValueOnce(JaneSmithMetriportPatient);

    const result = await createMetriportPatient(mockMetriport, patientData, facilityId, medplumPatientId);

    expect(result).toStrictEqual(JaneSmithMetriportPatient);
    expect(mockMetriport.createPatient).toHaveBeenCalledWith(expectedCreatePayload, facilityId);
  });

  test('handles Metriport API error', async () => {
    const error = new Error('API Error');
    mockMetriport.createPatient = vi.fn().mockRejectedValueOnce(error);

    await expect(createMetriportPatient(mockMetriport, patientData, facilityId, medplumPatientId)).rejects.toThrow(
      'Error creating patient in Metriport: API Error'
    );

    expect(mockMetriport.createPatient).toHaveBeenCalledWith(expectedCreatePayload, facilityId);
  });

  test('creates patient with minimal data', async () => {
    const minimalPatientData: ValidatedPatientData = {
      firstName: 'Jane',
      lastName: 'Smith',
      dob: '1996-02-10',
      genderAtBirth: 'female',
      addressLine1: '123 Arsenal St',
      city: 'Phoenix',
      state: 'AZ',
      zip: '85300',
    };

    const expectedMinimalPayload = {
      firstName: 'Jane',
      lastName: 'Smith',
      dob: '1996-02-10',
      genderAtBirth: 'F',
      address: [{ addressLine1: '123 Arsenal St', city: 'Phoenix', state: 'AZ', zip: '85300', country: 'USA' }],
      contact: [{ phone: undefined, email: undefined }],
      externalId: medplumPatientId,
    };

    mockMetriport.createPatient = vi.fn().mockResolvedValueOnce(JaneSmithMetriportPatient);

    const result = await createMetriportPatient(mockMetriport, minimalPatientData, facilityId, medplumPatientId);

    expect(result).toStrictEqual(JaneSmithMetriportPatient);
    expect(mockMetriport.createPatient).toHaveBeenCalledWith(expectedMinimalPayload, facilityId);
  });
});

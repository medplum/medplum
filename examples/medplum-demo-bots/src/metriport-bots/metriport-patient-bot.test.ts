import { getQuestionnaireAnswers, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MetriportMedicalApi } from '@metriport/api-sdk';
import {
  createMedplumPatient,
  findMatchingMetriportPatient,
  handler,
  ValidatedPatientData,
  validateQuestionnaireAnswers,
  ValidQuestionnaireResponseLinkId,
} from './metriport-patient-bot';
import { JaneSmithQuestionnaireResponse, JaneSmithMetriportPatient } from './metriport-patient-bot-test-data';

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
    await expect(
      handler(medplum, { bot, input: JaneSmithQuestionnaireResponse, contentType, secrets: {} })
    ).rejects.toThrow('Missing METRIPORT_API_KEY');
  });

  test('throws error if Metriport.matchPatient fails', async () => {
    const error = new Error('Network Error');

    vi.mocked(MetriportMedicalApi).mockImplementation(
      () =>
        ({
          matchPatient: vi.fn().mockRejectedValue(error),
        }) as Partial<MetriportMedicalApi> as MetriportMedicalApi
    );

    await expect(
      handler(medplum, { bot, input: JaneSmithQuestionnaireResponse, contentType, secrets })
    ).rejects.toThrow(
      new Error(`Error matching patient in Metriport: Network Error`, {
        cause: error,
      })
    );
  });

  test('creates patient in Medplum', async () => {
    vi.mocked(MetriportMedicalApi).mockImplementation(
      () =>
        ({
          matchPatient: vi.fn().mockResolvedValue(JaneSmithMetriportPatient),
        }) as Partial<MetriportMedicalApi> as MetriportMedicalApi
    );

    const patient = await handler(medplum, { bot, input: JaneSmithQuestionnaireResponse, contentType, secrets });
    expect(patient).toBeDefined();
  });
});

describe('validateQuestionnaireAnswers', () => {
  const requiredFields: ValidQuestionnaireResponseLinkId[] = [
    'firstName',
    'lastName',
    'dob',
    'genderAtBirth',
    'addressLine1',
    'city',
    'state',
    'zip',
  ];

  const optionalFields: ValidQuestionnaireResponseLinkId[] = [
    'driverLicenseNumber',
    'driverLicenseState',
    'phone',
    'email',
  ];

  const getErrorMessage = (field: ValidQuestionnaireResponseLinkId): string => {
    if (field === 'dob') {
      return 'Missing date of birth';
    }

    if (field === 'addressLine1' || field === 'city' || field === 'state' || field === 'zip') {
      return 'Missing address information';
    }

    return `Missing ${field
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .trim()}`;
  };

  requiredFields.forEach((field) => {
    test(`should throw error when ${field} is missing`, () => {
      const invalidResponse = { ...JaneSmithQuestionnaireResponse };
      invalidResponse.item = invalidResponse.item?.filter((item) => item.linkId !== field);

      const rawAnswers = getQuestionnaireAnswers(invalidResponse);

      expect(() => validateQuestionnaireAnswers(rawAnswers)).toThrow(getErrorMessage(field));
    });
  });

  ['driverLicenseNumber', 'driverLicenseState'].forEach((field) => {
    test(`throws error when ${field} is missing and the other is present`, () => {
      const invalidResponse = { ...JaneSmithQuestionnaireResponse };
      invalidResponse.item = invalidResponse.item?.filter((item) => item.linkId !== field);

      const rawAnswers = getQuestionnaireAnswers(invalidResponse);

      expect(() => validateQuestionnaireAnswers(rawAnswers)).toThrow('Missing driver license state or number');
    });
  });

  test('validates questionnaire with all fields present', () => {
    const rawAnswers = getQuestionnaireAnswers(JaneSmithQuestionnaireResponse);
    const answers = validateQuestionnaireAnswers(rawAnswers);

    expect(answers).toEqual({
      firstName: 'Jane',
      lastName: 'Smith',
      dob: '1996-02-10',
      genderAtBirth: 'female',
      addressLine1: '123 Arsenal St',
      city: 'Phoenix',
      state: 'AZ',
      zip: '85300',
      driverLicenseNumber: 'A98765432',
      phone: '555-555-5555',
      email: 'jane.smith@example.com',
    });
  });

  test('validates questionnaire with only required fields', () => {
    const minimalResponse = {
      ...JaneSmithQuestionnaireResponse,
      item: JaneSmithQuestionnaireResponse.item?.filter(
        (item) => !optionalFields.includes(item.linkId as ValidQuestionnaireResponseLinkId)
      ),
    };

    const rawAnswers = getQuestionnaireAnswers(minimalResponse);
    const answers = validateQuestionnaireAnswers(rawAnswers);

    expect(answers).toEqual({
      firstName: 'Jane',
      lastName: 'Smith',
      dob: '1996-02-10',
      genderAtBirth: 'female',
      addressLine1: '123 Arsenal St',
      city: 'Phoenix',
      state: 'AZ',
      zip: '85300',
      driverLicenseNumber: undefined,
      phone: undefined,
      email: undefined,
    });
  });

  test('handles empty optional fields', () => {
    const responseWithEmptyOptionals = { ...JaneSmithQuestionnaireResponse };
    responseWithEmptyOptionals.item = responseWithEmptyOptionals.item?.filter(
      (item) => !optionalFields.includes(item.linkId as ValidQuestionnaireResponseLinkId)
    );

    const rawAnswers = getQuestionnaireAnswers(responseWithEmptyOptionals);
    const answers = validateQuestionnaireAnswers(rawAnswers);

    expect(answers.driverLicenseNumber).toBeUndefined();
    expect(answers.phone).toBeUndefined();
    expect(answers.email).toBeUndefined();
  });
});

describe('createMedplumPatient', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  test('creates patient with all fields', async () => {
    const patientData: ValidatedPatientData = {
      firstName: 'Jane',
      lastName: 'Smith',
      dob: '1996-02-10',
      genderAtBirth: 'female',
      addressLine1: '123 Arsenal St',
      city: 'Phoenix',
      state: 'AZ',
      zip: '85300',
      driverLicenseNumber: 'A98765432',
      phone: '555-555-5555',
      email: 'jane.smith@example.com',
    };

    const patient = await createMedplumPatient(medplum, patientData);

    expect(patient.name?.[0].given?.[0]).toBe('Jane');
    expect(patient.name?.[0].family).toBe('Smith');
    expect(patient.birthDate).toBe('1996-02-10');
    expect(patient.gender).toBe('female');
    expect(patient.address?.[0].line?.[0]).toBe('123 Arsenal St');
    expect(patient.address?.[0].city).toBe('Phoenix');
    expect(patient.address?.[0].state).toBe('AZ');
    expect(patient.address?.[0].postalCode).toBe('85300');
    expect(patient.identifier?.[0].value).toBe('A98765432');
    expect(patient.telecom?.find((t) => t.system === 'phone')?.value).toBe('555-555-5555');
    expect(patient.telecom?.find((t) => t.system === 'email')?.value).toBe('jane.smith@example.com');
  });

  test('creates patient with only required fields', async () => {
    const patientData: ValidatedPatientData = {
      firstName: 'Jane',
      lastName: 'Smith',
      dob: '1996-02-10',
      genderAtBirth: 'female',
      addressLine1: '123 Arsenal St',
      city: 'Phoenix',
      state: 'AZ',
      zip: '85300',
    };

    const patient = await createMedplumPatient(medplum, patientData);

    expect(patient.name?.[0].given?.[0]).toBe('Jane');
    expect(patient.name?.[0].family).toBe('Smith');
    expect(patient.birthDate).toBe('1996-02-10');
    expect(patient.gender).toBe('female');
    expect(patient.address?.[0].line?.[0]).toBe('123 Arsenal St');
    expect(patient.address?.[0].city).toBe('Phoenix');
    expect(patient.address?.[0].state).toBe('AZ');
    expect(patient.address?.[0].postalCode).toBe('85300');
    expect(patient.identifier).toBeUndefined();
    expect(patient.telecom).toBeUndefined();
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
    driverLicenseNumber: 'A98765432',
    driverLicenseState: 'AZ',
    phone: '555-555-5555',
    email: 'jane.smith@example.com',
  };
  const matchPatientCalledWith = {
    firstName: 'Jane',
    lastName: 'Smith',
    dob: '1996-02-10',
    genderAtBirth: 'F',
    personalIdentifiers: [{ type: 'driversLicense', state: 'AZ', value: 'A98765432' }],
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

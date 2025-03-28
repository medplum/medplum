import { BotEvent, getQuestionnaireAnswers, MedplumClient, normalizeErrorString } from '@medplum/core';
import { Patient, QuestionnaireResponse, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';
import { MetriportMedicalApi, PatientDTO, USState, Demographics, PatientCreate } from '@metriport/api-sdk';

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<Patient> {
  const metriportApiKey = event.secrets['METRIPORT_API_KEY']?.valueString;
  if (!metriportApiKey) {
    throw new Error('Missing METRIPORT_API_KEY');
  }
  const metriport = new MetriportMedicalApi(
    metriportApiKey,
    // Comment the sandbox line for production
    { sandbox: true }
  );

  const rawAnswers = getQuestionnaireAnswers(event.input);
  const validatedData = validateQuestionnaireAnswers(rawAnswers);

  // Create the patient in Medplum
  // TODO: Refactor to upsert the patient
  const medplumPatient = await createMedplumPatient(medplum, validatedData);

  // Find a matching patient on Metriport
  let metriportPatient = await findMatchingMetriportPatient(metriport, validatedData);

  // Create a new patient in Metriport, if they don't exist
  if (!metriportPatient) {
    // FIXME: This is a hardcoded facility ID. Should we get this from the QuestionnaireResponse? It can link to a Organization resource.
    const facilityId = '0195d964-d166-7226-8912-76934c23c140';
    metriportPatient = await createMetriportPatient(metriport, validatedData, facilityId, medplumPatient.id as string);
  }

  // TODO: Get the patient's records from Metriport
  // TODO: Create FHIR resources in Medplum

  return medplumPatient;
}

export type ValidQuestionnaireResponseLinkId =
  | 'firstName'
  | 'lastName'
  | 'dob'
  | 'genderAtBirth'
  | 'addressLine1'
  | 'city'
  | 'state'
  | 'zip'
  | 'driverLicenseNumber'
  | 'driverLicenseState'
  | 'phone'
  | 'email';

export interface ValidatedPatientData {
  firstName: string;
  lastName: string;
  dob: string;
  genderAtBirth: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  driverLicenseNumber?: string;
  driverLicenseState?: string;
  phone?: string;
  email?: string;
}

export function validateQuestionnaireAnswers(
  answers: Record<ValidQuestionnaireResponseLinkId, QuestionnaireResponseItemAnswer>
): ValidatedPatientData {
  // Required fields
  const firstName = answers['firstName']?.valueString;
  if (!firstName) {
    throw new Error('Missing first name');
  }

  const lastName = answers['lastName']?.valueString;
  if (!lastName) {
    throw new Error('Missing last name');
  }

  const dob = answers['dob']?.valueDate;
  if (!dob) {
    throw new Error('Missing date of birth');
  }

  const genderAtBirth = answers['genderAtBirth']?.valueCoding?.code;
  if (!genderAtBirth) {
    throw new Error('Missing gender at birth');
  }

  const addressLine1 = answers['addressLine1']?.valueString;
  const city = answers['city']?.valueString;
  const state = answers['state']?.valueCoding?.code;
  const zip = answers['zip']?.valueString;
  if (!addressLine1 || !city || !state || !zip) {
    throw new Error('Missing address information');
  }

  // Optional fields
  const driverLicenseNumber = answers['driverLicenseNumber']?.valueString;
  const driverLicenseState = answers['driverLicenseState']?.valueCoding?.code;
  if (Boolean(driverLicenseNumber) !== Boolean(driverLicenseState)) {
    throw new Error('Missing driver license state or number');
  }
  const phone = answers['phone']?.valueString;
  const email = answers['email']?.valueString;

  return {
    firstName,
    lastName,
    dob,
    genderAtBirth,
    addressLine1,
    city,
    state,
    zip,
    driverLicenseNumber,
    phone,
    email,
  };
}

export async function createMedplumPatient(medplum: MedplumClient, patient: ValidatedPatientData): Promise<Patient> {
  const { firstName, lastName, dob, genderAtBirth, addressLine1, city, state, zip, driverLicenseNumber, phone, email } =
    patient;

  const medplumPatient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: [firstName], family: lastName }],
    birthDate: dob,
    gender: genderAtBirth as Patient['gender'],
    address: [{ line: [addressLine1], city, state, postalCode: zip }],
    identifier: driverLicenseNumber
      ? [
          {
            type: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                  code: 'DL',
                  display: "Driver's License",
                },
              ],
              text: "Driver's License",
            },
            system: 'urn:oid:2.16.840.1.113883.4.3.25',
            value: driverLicenseNumber,
          },
        ]
      : undefined,
    telecom:
      phone || email
        ? [
            ...(phone ? [{ system: 'phone' as const, value: phone }] : []),
            ...(email ? [{ system: 'email' as const, value: email }] : []),
          ]
        : undefined,
  });

  return medplumPatient;
}

// Function overloads to ensure type safety
export function buildMetriportPatientPayload(patient: ValidatedPatientData): Demographics;
export function buildMetriportPatientPayload(patient: ValidatedPatientData, medplumPatientId: string): PatientCreate;
export function buildMetriportPatientPayload(
  patient: ValidatedPatientData,
  medplumPatientId?: string
): Demographics | PatientCreate {
  const medplumGenderToMetriportGenderMap: Record<string, 'M' | 'F' | 'O' | 'U'> = {
    male: 'M',
    female: 'F',
    other: 'O',
    unknown: 'U',
  };

  const {
    firstName,
    lastName,
    dob,
    genderAtBirth,
    addressLine1,
    city,
    state,
    zip,
    driverLicenseNumber,
    driverLicenseState,
    phone,
    email,
  } = patient;

  const payload = {
    firstName,
    lastName,
    dob,
    genderAtBirth: medplumGenderToMetriportGenderMap[genderAtBirth],
    address: [{ addressLine1, city, state: USState[state as keyof typeof USState], zip, country: 'USA' }],
    personalIdentifiers:
      driverLicenseNumber && driverLicenseState
        ? [
            {
              type: 'driversLicense' as const,
              state: USState[driverLicenseState as keyof typeof USState],
              value: driverLicenseNumber,
            },
          ]
        : undefined,
    contact: [{ phone, email }],
  };

  if (medplumPatientId) {
    return { ...payload, externalId: medplumPatientId } as PatientCreate;
  }

  return payload as Demographics;
}

export async function findMatchingMetriportPatient(
  metriport: MetriportMedicalApi,
  patient: ValidatedPatientData
): Promise<PatientDTO | undefined> {
  try {
    return await metriport.matchPatient(buildMetriportPatientPayload(patient));
  } catch (error) {
    throw new Error(`Error matching patient in Metriport: ${normalizeErrorString(error)}`, {
      cause: error,
    });
  }
}

export async function createMetriportPatient(
  metriport: MetriportMedicalApi,
  patient: ValidatedPatientData,
  facilityId: string,
  medplumPatientId: string
): Promise<PatientDTO> {
  try {
    return await metriport.createPatient(buildMetriportPatientPayload(patient, medplumPatientId), facilityId);
  } catch (error) {
    throw new Error(`Error creating patient in Metriport: ${normalizeErrorString(error)}`, {
      cause: error,
    });
  }
}

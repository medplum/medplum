import { BotEvent, getQuestionnaireAnswers, MedplumClient, normalizeErrorString } from '@medplum/core';
import { Patient, QuestionnaireResponse, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';
import { MetriportMedicalApi, PatientDTO, USState } from '@metriport/api-sdk';

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<Patient> {
  // Initialize the Metriport API client
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
  } = validateQuestionnaireAnswers(rawAnswers);

  // Create the patient in Medplum
  const medplumPatient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [
      {
        given: [firstName],
        family: lastName,
      },
    ],
    birthDate: dob,
    gender: genderAtBirth as Patient['gender'],
    address: [
      {
        line: [addressLine1],
        city,
        state,
        postalCode: zip,
      },
    ],
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

  // Find a matching patient on Metriport
  let metriportPatient: PatientDTO | undefined;
  try {
    metriportPatient = await metriport.matchPatient({
      firstName: firstName,
      lastName: lastName,
      dob: dob,
      genderAtBirth: MEDPLUM_GENDER_TO_METRIPORT_GENDER_MAP[genderAtBirth],
      personalIdentifiers:
        driverLicenseNumber && driverLicenseState
          ? [
              {
                type: 'driversLicense',
                state: USState[driverLicenseState as keyof typeof USState],
                value: driverLicenseNumber,
              },
            ]
          : undefined,
      address: [
        {
          addressLine1: addressLine1,
          city: city,
          state: USState[state as keyof typeof USState],
          zip: zip,
          country: 'USA',
        },
      ],
      contact: [
        {
          phone: phone,
          email: email,
        },
      ],
    });
    console.log('Found the patient in Metriport:\n', JSON.stringify(metriportPatient, null, 2));
  } catch (error) {
    throw new Error(`Error matching patient in Metriport: ${normalizeErrorString(error)}`, {
      cause: error,
    });
  }

  if (!metriportPatient) {
    // TODO: Create a new patient in Metriport, if they don't exist
  }

  // TODO: Get the patient's records from Metriport

  // TODO: Create FHIR resources in Medplum

  return medplumPatient;
}

const MEDPLUM_GENDER_TO_METRIPORT_GENDER_MAP: Record<string, 'M' | 'F' | 'O' | 'U'> = {
  male: 'M',
  female: 'F',
  other: 'O',
  unknown: 'U',
};

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

interface PatientAnswers {
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
): PatientAnswers {
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

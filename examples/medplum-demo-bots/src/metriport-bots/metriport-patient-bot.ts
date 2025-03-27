import { BotEvent, getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import { Patient, QuestionnaireResponse } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<Patient> {
  const rawAnswers = getQuestionnaireAnswers(event.input);
  const { firstName, lastName, dob, genderAtBirth, addressLine1, city, state, zip, ssn, phone, email } =
    validateQuestionnaireAnswers(rawAnswers);

  // Create the patient in Medplum
  const patient = await medplum.createResource<Patient>({
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
    identifier: ssn
      ? [
          {
            type: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                  code: 'SS',
                },
              ],
            },
            system: 'http://hl7.org/fhir/sid/us-ssn',
            value: ssn,
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

  // TODO: Match the patient in Metriport

  // TODO: Create a new patient in Metriport, if they don't exist

  // TODO: Get the patient in Metriport

  // TODO: Get the patient's records from Metriport

  // TODO: Create FHIR resources in Medplum

  return patient;
}

// TODO: Uncomment this
// const MEDPLUM_GENDER_TO_METRIPORT_GENDER_MAP = {
//   male: 'M',
//   female: 'F',
//   other: 'O',
//   unknown: 'U',
// };

interface PatientAnswers {
  firstName: string;
  lastName: string;
  dob: string;
  genderAtBirth: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  ssn?: string;
  phone?: string;
  email?: string;
}

export function validateQuestionnaireAnswers(answers: Record<string, any>): PatientAnswers {
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
  const ssn = answers['ssn']?.valueString;
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
    ssn,
    phone,
    email,
  };
}

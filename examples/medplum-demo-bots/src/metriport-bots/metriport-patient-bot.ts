import { BotEvent, MedplumClient, normalizeErrorString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { MetriportMedicalApi, PatientDTO, USState, Demographics, PatientCreate } from '@metriport/api-sdk';

export async function handler(medplum: MedplumClient, event: BotEvent<Patient>): Promise<void> {
  const metriportApiKey = event.secrets['METRIPORT_API_KEY']?.valueString;
  if (!metriportApiKey) {
    throw new Error('Missing METRIPORT_API_KEY');
  }
  const metriport = new MetriportMedicalApi(
    metriportApiKey,
    // Comment the sandbox line for production
    { sandbox: true }
  );

  const medplumPatient = event.input;

  const validatedData = validatePatientResource(medplumPatient);

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
}

export interface ValidatedPatientData {
  firstName: string;
  lastName: string;
  dob: string;
  genderAtBirth: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  email?: string;
}

export function validatePatientResource(patient: Patient): ValidatedPatientData {
  // Required fields
  const firstName = patient.name?.[0]?.given?.[0];
  if (!firstName) {
    throw new Error('Missing first name');
  }

  const lastName = patient.name?.[0]?.family;
  if (!lastName) {
    throw new Error('Missing last name');
  }

  const dob = patient.birthDate;
  if (!dob) {
    throw new Error('Missing date of birth');
  }

  const genderAtBirth = patient.gender;
  if (!genderAtBirth) {
    throw new Error('Missing gender');
  }

  const address = patient.address?.[0];
  const addressLine1 = address?.line?.[0];
  const city = address?.city;
  const state = address?.state;
  const zip = address?.postalCode;
  if (!addressLine1 || !city || !state || !zip) {
    throw new Error('Missing address information');
  }

  // Optional fields
  const phone = patient.telecom?.find((t) => t.system === 'phone')?.value;
  const email = patient.telecom?.find((t) => t.system === 'email')?.value;

  return {
    firstName,
    lastName,
    dob,
    genderAtBirth,
    addressLine1,
    city,
    state,
    zip,
    phone,
    email,
  };
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

  const { firstName, lastName, dob, genderAtBirth, addressLine1, city, state, zip, phone, email } = patient;

  const payload = {
    firstName,
    lastName,
    dob,
    genderAtBirth: medplumGenderToMetriportGenderMap[genderAtBirth],
    address: [{ addressLine1, city, state: USState[state as keyof typeof USState], zip, country: 'USA' }],
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
    const matchedPatient = await metriport.matchPatient(buildMetriportPatientPayload(patient));
    console.log('Found matching patient in Metriport:', JSON.stringify(matchedPatient, null, 2));
    return matchedPatient;
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
    const createdPatient = await metriport.createPatient(
      buildMetriportPatientPayload(patient, medplumPatientId),
      facilityId
    );
    console.log('Created patient in Metriport:', JSON.stringify(createdPatient, null, 2));
    return createdPatient;
  } catch (error) {
    throw new Error(`Error creating patient in Metriport: ${normalizeErrorString(error)}`, {
      cause: error,
    });
  }
}

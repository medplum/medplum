import { BotEvent, MedplumClient, normalizeErrorString } from '@medplum/core';
import { Organization, Patient } from '@medplum/fhirtypes';
import { MetriportMedicalApi, PatientDTO, USState, Demographics, PatientCreate } from '@metriport/api-sdk';

/**
 * This bot is used to request medical records from the Metriport Medical API for a given Medplum
 * Patient resource. It will then trigger an asynchronous query to retrieve the patient's
 * consolidated data in FHIR JSON format. The results are sent through Webhook.
 * See the consolidated-data-webhook.ts file for the webhook bot handler.
 *
 * References:
 * - Medplum Consuming Webhook: https://www.medplum.com/docs/bots/consuming-webhooks
 * - Metriport Medical API: https://docs.metriport.com/medical-api
 *
 * @param medplum - The Medplum client
 * @param event - The BotEvent object containing the Medplum Patient resource
 *
 * @returns A promise that resolves to void
 */
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
    const facilityId = await getMetriportFacilityIdFromMedplumPatient(medplum, medplumPatient);
    if (!facilityId) {
      console.warn(`Skipping patient creation in Metriport because facility ID is missing.`);
      return;
    }
    metriportPatient = await createMetriportPatient(metriport, validatedData, facilityId, medplumPatient.id as string);
  }

  // Trigger an asynchronous query to retrieve the patient's consolidated data in FHIR JSON format.
  // The results are sent through Webhook (see https://docs.metriport.com/medical-api/more-info/webhooks).
  // See the consolidated-data-webhook.ts file for the webhook handler.
  const consolidatedData = await metriport.startConsolidatedQuery(
    metriportPatient.id,
    undefined, // A comma separated, case sensitive list of resources to be returned. If none are provided all resources will be included
    undefined, // No start date
    undefined, // No end date
    'json', // FHIR JSON format
    undefined, // No fromDashboard
    {
      medplumPatientId: medplumPatient.id as string,
    }
  );
  console.log('Consolidated data:', JSON.stringify(consolidatedData, null, 2));
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

/**
 * Retrieves the Metriport Facility ID from the Patient's managingOrganization.
 * Assumes the Organization resource contains an identifier with the system
 * 'https://metriport.com/fhir/identifiers/organization-id'.
 *
 * @param medplum - The Medplum client.
 * @param patient - The Medplum Patient resource.
 * @returns The Metriport Facility ID.
 */
export async function getMetriportFacilityIdFromMedplumPatient(
  medplum: MedplumClient,
  patient: Patient
): Promise<string | undefined> {
  const METRIPORT_ORGANIZATION_ID_SYSTEM = 'https://metriport.com/fhir/identifiers/organization-id';

  if (!patient.managingOrganization?.reference) {
    console.warn(`Patient ${patient.id} is missing the managingOrganization reference.`);
    return undefined;
  }

  let organization: Organization;
  try {
    organization = await medplum.readReference(patient.managingOrganization);
  } catch (error) {
    console.warn(
      `Error reading Organization reference ${patient.managingOrganization.reference}: ${normalizeErrorString(error)}`
    );
    return undefined;
  }

  const facilityIdentifier = organization.identifier?.find((id) => id.system === METRIPORT_ORGANIZATION_ID_SYSTEM);

  if (!facilityIdentifier?.value) {
    console.warn(
      `Organization ${organization.id} is missing the required Metriport facility identifier (system: ${METRIPORT_ORGANIZATION_ID_SYSTEM}).`
    );
    return undefined;
  }

  return facilityIdentifier.value;
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

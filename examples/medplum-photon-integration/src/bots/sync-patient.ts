import { BotEvent, getReferenceString, MedplumClient, normalizeErrorString, PatchOperation } from '@medplum/core';
import { Address, AllergyIntolerance, ContactPoint, Identifier, MedicationRequest, Patient } from '@medplum/fhirtypes';
import fetch from 'node-fetch';
import {
  CreatePatientVariables,
  PhotonAddress,
  PhotonAllergenInput,
  PhotonMedHistoryInput,
  PhotonPatient,
} from '../photon-types';

export async function handler(medplum: MedplumClient, event: BotEvent<Patient>): Promise<PhotonPatient> {
  const patient = event.input;
  const CLIENT_ID = event.secrets['PHOTON_CLIENT_ID']?.valueString;
  const CLIENT_SECRET = event.secrets['PHOTON_CLIENT_SECRET']?.valueString;

  const PHOTON_AUTH_TOKEN = await handlePhotonAuth(CLIENT_ID, CLIENT_SECRET);

  const query = `
    mutation createPatient(
      $externalId: ID
      $name: NameInput!
      $dateOfBirth: AWSDate!
      $sex: SexType!
      $gender: String
      $email: AWSEmail
      $phone: AWSPhone!
      $address: AddressInput
    ) {
      createPatient(
        externalId: $externalId
        name: $name
        dateOfBirth: $dateOfBirth
        sex: $sex
        gender: $gender
        email: $email
        phone: $phone
        address: $address
      ) { id }
    }
  `;

  if (!patient.birthDate) {
    throw new Error('Patient birth date is required to sync to Photon Health');
  }

  if (!patient.name) {
    throw new Error('Patient name is required to sync to Photon Health');
  }

  const variables: CreatePatientVariables = {
    externalId: patient.id as string,
    name: {
      first: patient.name?.[0].given?.[0] ?? '',
      last: patient.name?.[0].family ?? '',
    },
    dateOfBirth: formatAWSDate(patient.birthDate),
    sex: getSexType(patient.gender),
    gender: patient.gender ?? 'unknown',
    phone: getTelecom('phone', patient),
  };

  const email = getTelecom('email', patient);
  const address = formatPhotonAddress(patient.address?.[0]);
  const allergies = (await formatPhotonInput(
    patient,
    medplum,
    PHOTON_AUTH_TOKEN,
    'AllergyIntolerance'
  )) as PhotonAllergenInput[];
  const medicationHistory = (await formatPhotonInput(
    patient,
    medplum,
    PHOTON_AUTH_TOKEN,
    'MedicationRequest'
  )) as PhotonMedHistoryInput[];

  if (email) {
    variables.email = email;
  }

  if (address) {
    variables.address = address;
  }

  if (allergies) {
    variables.allergies = allergies;
  }

  if (medicationHistory) {
    variables.medicationHistory = medicationHistory;
  }

  const body = JSON.stringify({ query, variables });

  try {
    const response = await fetch('https://api.neutron.health/graphql', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + PHOTON_AUTH_TOKEN,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    if (result.errors?.[0]) {
      throw new Error(result.errors[0].message);
    }
    await updatePatient(medplum, patient, result);
    return result.data.createPatient;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

async function handlePhotonAuth(clientId?: string, clientSecret?: string): Promise<string> {
  if (!clientId || !clientSecret) {
    throw new Error('Unable to authenticate. Invalid client ID or secret.');
  }

  const body = {
    client_id: clientId,
    client_secret: clientSecret,
    audience: 'https://api.neutron.health',
    grant_type: 'client_credentials',
  };

  try {
    const response = await fetch('https://auth.neutron.health/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result.access_token;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

async function updatePatient(medplum: MedplumClient, patient: Patient, result: any): Promise<void> {
  const patientData = result.data.createPatient;
  const photonId = patientData.id;

  const photonIdentifier: Identifier = {
    system: 'https://neutron.health/patients',
    value: photonId,
  };

  const identifiers: Identifier[] = patient.identifier ?? [];
  identifiers.push(photonIdentifier);

  const patientId = patient.id as string;
  const op = patient.identifier ? 'replace' : 'add';

  const ops: PatchOperation[] = [
    { op: 'test', path: '/meta/versionId', value: patient.meta?.versionId },
    { op, path: '/identifier', value: identifiers },
  ];

  try {
    await medplum.patchResource('Patient', patientId, ops);
    console.log('Success');
  } catch (err) {
    console.error(err);
  }
}

export async function formatPhotonInput(
  patient: Patient,
  medplum: MedplumClient,
  authToken: string,
  inputType: 'AllergyIntolerance' | 'MedicationRequest'
): Promise<(PhotonAllergenInput | PhotonMedHistoryInput)[] | undefined> {
  const inputs: (PhotonAllergenInput | PhotonMedHistoryInput)[] = [];
  const resources = await medplum.searchResources(inputType, {
    patient: getReferenceString(patient),
  });

  if (resources.length === 0) {
    return undefined;
  }

  for (const resource of resources) {
    const photonId = await getPhotonId(resource, authToken);
    if (!photonId) {
      continue;
    }

    const input = createInput(resource, photonId);
    inputs.push(input);
  }

  return inputs;
}

function createInput(
  resource: AllergyIntolerance | MedicationRequest,
  photonId: string
): PhotonAllergenInput | PhotonMedHistoryInput {
  if (resource.resourceType === 'AllergyIntolerance') {
    const input: PhotonAllergenInput = {
      allergenId: photonId,
      comment: resource.note?.[0].text,
    };
    if (resource.onsetDateTime) {
      input.onset = formatAWSDate(resource.onsetDateTime);
    }

    return input;
  } else {
    const input: PhotonMedHistoryInput = {
      medicationId: photonId,
      active: resource.status === 'active',
      comment: resource.note?.[0].text,
    };
    return input;
  }
}

async function getPhotonId(
  resource: AllergyIntolerance | MedicationRequest,
  authToken: string
): Promise<string | undefined> {
  const photonId = resource.identifier?.find((id) => id.system === 'https://neutron.health')?.value;
  if (photonId) {
    return photonId;
  }

  const code = resource.resourceType === 'AllergyIntolerance' ? resource.code : resource.medicationCodeableConcept;
  const rxcui = code?.coding?.find((code) => code.system === 'http://www.nlm.nih.gov/research/umls/rxnorm')?.code;
  if (!rxcui) {
    return undefined;
  }
  const body = formatRequestBody(resource.resourceType, rxcui);

  try {
    const response = await fetch('https://api.neutron.health/graphql', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + authToken,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const id =
      resource.resourceType === 'AllergyIntolerance'
        ? result.data.allergens?.[0]?.id
        : result.data.medications?.[0]?.id;

    return id;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

function formatRequestBody(resourceType: 'AllergyIntolerance' | 'MedicationRequest', rxcui: string): string {
  let query: string;
  let variables: any;
  switch (resourceType) {
    case 'AllergyIntolerance':
      query = `
        query allergens($filter: AllergenFilter) {
          allergens(filter: $filter) { id }
        }
      `;
      variables = { name: rxcui };
      return JSON.stringify({ query, variables });
    case 'MedicationRequest':
      query = `
        query medications(
          $filter: MedicationFilter,
          $after: ID,
          $first: Int
        ) {
          medications(
            filter: $filter,
            after: $after,
            first: $first
          ) {
            id
          }
        }
      `;
      variables = { drug: { code: rxcui } };
      return JSON.stringify({ query, variables });
    default:
      throw new Error('Invalid resource type');
  }
}

function formatAWSDate(date?: string): string {
  if (!date) {
    return '1970-01-01';
  }

  return new Date(date).toISOString().slice(0, 10);
}

function getSexType(sex?: Patient['gender']): 'MALE' | 'FEMALE' | 'UNKNOWN' {
  if (sex === 'female') {
    return 'FEMALE';
  } else if (sex === 'male') {
    return 'MALE';
  } else {
    return 'UNKNOWN';
  }
}

export function getTelecom(system: ContactPoint['system'], person?: Patient): string | undefined {
  if (!person) {
    throw new Error('No patient provided');
  }

  const telecom = person.telecom?.find((comm) => comm.system === system);
  const telecomValue = telecom?.value;

  if (!telecomValue && system === 'phone') {
    throw new Error('Patient phone number is required to sync to Photon Health');
  }

  if (!telecomValue) {
    return undefined;
  }

  if (system === 'phone') {
    return telecomValue.slice(0, 1) === '+1' ? telecomValue : '+1' + telecomValue;
  } else {
    return telecomValue;
  }
}

function formatPhotonAddress(address?: Address): PhotonAddress | undefined {
  if (!address) {
    return undefined;
  }

  return {
    street1: address.line?.[0] ?? '',
    street2: address.line?.[1] ?? '',
    city: address.city ?? '',
    state: address.state ?? '',
    country: address.country ?? '',
    postalCode: address.postalCode ?? '',
  };
}

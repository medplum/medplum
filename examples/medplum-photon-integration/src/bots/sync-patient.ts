import { BotEvent, getReferenceString, MedplumClient, normalizeErrorString, PatchOperation } from '@medplum/core';
import { AllergyIntolerance, Identifier, MedicationRequest, Patient } from '@medplum/fhirtypes';
import fetch from 'node-fetch';
import { CreatePatientVariables, PhotonAllergenInput, PhotonMedHistoryInput, PhotonPatient } from '../photon-types';
import { formatAWSDate, formatPhotonAddress, getSexType, getTelecom, handlePhotonAuth } from './utils';

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
  const allergies = await createAllergyInputs(patient, medplum, PHOTON_AUTH_TOKEN);
  const medicationHistory = await createMedHistoryInputs(patient, medplum, PHOTON_AUTH_TOKEN);

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
  const result = await photonGraphqlFetch(body, PHOTON_AUTH_TOKEN);
  await updatePatient(medplum, patient, result);
  return result.data.createPatient;
}

async function photonGraphqlFetch(body: string, authToken: string): Promise<any> {
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
    return result;
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

export async function createMedHistoryInputs(
  patient: Patient,
  medplum: MedplumClient,
  authToken: string
): Promise<PhotonMedHistoryInput[]> {
  const medicationRequests = await medplum.searchResources('MedicationRequest', {
    patient: getReferenceString(patient),
  });

  if (medicationRequests.length === 0) {
    return [];
  }

  const resourceIds: [MedicationRequest, string][] = [];

  for (const medicationRequest of medicationRequests) {
    const photonMedicationId = await getPhotonMedicationId(medicationRequest, authToken);
    if (photonMedicationId) {
      resourceIds.push([medicationRequest, photonMedicationId]);
    }
  }

  const medHistory = (await formatPhotonInput(resourceIds)) as PhotonMedHistoryInput[];
  return medHistory;
}

export async function createAllergyInputs(
  patient: Patient,
  medplum: MedplumClient,
  authToken: string
): Promise<PhotonAllergenInput[]> {
  const allergyInputs: PhotonAllergenInput[] = [];
  const allergies = await medplum.searchResources('AllergyIntolerance', {
    patient: getReferenceString(patient),
  });

  if (allergies.length === 0) {
    return [];
  }

  for (const allergy of allergies) {
    const photonAllergyId = await getPhotonAllergyId(allergy, authToken);
    if (!photonAllergyId) {
      continue;
    }

    const allergyInput = createInput(allergy, photonAllergyId) as PhotonAllergenInput;
    allergyInputs.push(allergyInput);
  }

  return allergyInputs;
}

export async function formatPhotonInput(
  resources: [AllergyIntolerance | MedicationRequest, string][]
): Promise<(PhotonAllergenInput | PhotonMedHistoryInput)[] | undefined> {
  const inputs: (PhotonAllergenInput | PhotonMedHistoryInput)[] = [];

  for (const [resource, photonId] of resources) {
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

async function getPhotonAllergyId(allergy: AllergyIntolerance, authToken: string): Promise<string | undefined> {
  const photonId = getIdentifier(allergy.identifier);
  if (photonId) {
    return photonId;
  }

  const rxcui = allergy.code?.coding?.find(
    (code) => code.system === 'http://www.nlm.nih.gov/research/umls/rxnorm'
  )?.code;
  if (!rxcui) {
    return undefined;
  }

  const body = formatRequestBody(allergy.resourceType, rxcui);
  const result = await photonGraphqlFetch(body, authToken);
  const id = result.data.allergens?.[0]?.id as string;
  return id;
}

async function getPhotonMedicationId(medication: MedicationRequest, authToken: string): Promise<string | undefined> {
  const photonId = getIdentifier(medication.identifier);
  if (photonId) {
    return photonId;
  }

  const rxcui = medication.medicationCodeableConcept?.coding?.find(
    (code) => code.system === 'http://www.nlm.nih.gov/research/umls/rxnorm'
  )?.code;
  if (!rxcui) {
    return undefined;
  }

  const body = formatRequestBody(medication.resourceType, rxcui);
  const result = await photonGraphqlFetch(body, authToken);
  const id = result.data.medications?.[0]?.id as string;
  return id;
}

function getIdentifier(identifiers?: Identifier[]): string | undefined {
  if (!identifiers) {
    return undefined;
  }

  const photonId = identifiers.find((id) => id.system === 'https://neutron.health')?.value;
  return photonId;
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

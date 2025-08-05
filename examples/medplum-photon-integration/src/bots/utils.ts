// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient, normalizeErrorString } from '@medplum/core';
import {
  Address,
  CodeableConcept,
  Coding,
  ContactPoint,
  MedicationKnowledge,
  MedicationRequest,
  Patient,
} from '@medplum/fhirtypes';
import { createHmac } from 'crypto';
import { OrderData, PhotonAddress, PhotonEvent, PhotonWebhook } from '../photon-types';
import { NEUTRON_HEALTH } from './constants';

export async function photonGraphqlFetch(body: string, authToken: string): Promise<any> {
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

export function formatAWSDate(date?: string): string {
  if (!date) {
    return '1970-01-01';
  }

  return new Date(date).toISOString().slice(0, 10);
}

export function getSexType(sex?: Patient['gender']): 'MALE' | 'FEMALE' | 'UNKNOWN' {
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

export function formatPhotonAddress(address?: Address): PhotonAddress | undefined {
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

export async function handlePhotonAuth(clientId?: string, clientSecret?: string): Promise<string> {
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

    const result = (await response.json()) as any;
    return result.access_token as string;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

export function checkForDuplicateEvent(event: PhotonEvent, medicationRequest?: MedicationRequest): boolean {
  if (!medicationRequest) {
    return false;
  }

  const dupe = medicationRequest.identifier?.find((id) => id.value === event.id);

  if (dupe) {
    return true;
  } else {
    return false;
  }
}

export function verifyEvent(photonEvent: PhotonWebhook, secret: string): boolean {
  const signature = photonEvent.headers['x-photon-signature'];
  const body = photonEvent.body;

  const hmac = createHmac('sha256', secret);
  const digest = hmac.update(JSON.stringify(body)).digest('hex');

  return digest === signature;
}

export async function getExistingMedicationRequest(
  data: PhotonEvent['data'],
  medplum: MedplumClient
): Promise<MedicationRequest | undefined> {
  const id = data.externalId;
  const photonId = data.id;

  let existingPrescription = await medplum.searchOne('MedicationRequest', {
    identifier: NEUTRON_HEALTH + `|${photonId}`,
  });

  if (existingPrescription) {
    return existingPrescription;
  }

  if (!id) {
    return undefined;
  }
  existingPrescription = await medplum.readResource('MedicationRequest', id);

  return existingPrescription;
}

/**
 * Takes the patient data from a Photon event and searches for that patient in your project, returning it if it exists.
 *
 * @param patientData - The partial patient data from a Photon order event
 * @param medplum - MedplumClient to search your project for a patient
 * @returns Your project's patient from the Photon event if it exists
 */
export async function getPatient(
  patientData: OrderData['patient'],
  medplum: MedplumClient
): Promise<Patient | undefined> {
  const id = patientData.externalId;
  const photonId = patientData.id;

  let patient: Patient | undefined;
  // Search for the patient based on the photon ID
  patient = await medplum.searchOne('Patient', {
    identifier: NEUTRON_HEALTH + `|${photonId}`,
  });

  if (patient) {
    return patient;
  }

  if (!id) {
    return undefined;
  }

  // Search for the patient based on the medplum id
  patient = await medplum.readResource('Patient', id);
  return patient;
}

/**
 * Takes data from the webhook to find the corresponding Medication resource in your project.
 *
 * @param medplum - Medplum Cient to search for the medication in your project
 * @param rxcui - The rxcui code of the medication
 * @returns The Medication resource from your project if it exists
 */
export async function getMedicationKnowledge(
  medplum: MedplumClient,
  rxcui?: string
): Promise<MedicationKnowledge | undefined> {
  if (!rxcui) {
    return undefined;
  }
  try {
    const medication = await medplum.searchOne('MedicationKnowledge', {
      code: rxcui,
    });

    return medication;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

export async function getMedicationElement(
  medplum: MedplumClient,
  rxcui?: string,
  medicationName?: string
): Promise<CodeableConcept> {
  let medicationKnowledge = await getMedicationKnowledge(medplum, rxcui);
  if (!medicationKnowledge) {
    try {
      medicationKnowledge = await createMedicationKnowledge(medplum, rxcui, medicationName);
    } catch (err) {
      throw new Error(normalizeErrorString(err));
    }
  }

  const medicationCode = medicationKnowledge.code;
  if (!medicationCode) {
    throw new Error('Medication has no code and could not be added to the prescription');
  }

  return medicationCode;
}

/**
 * Takes data from a Photon prescription created event and creates a FHIR Medication resource in your project. If there is no
 * linked RX Norm code, the Medication will not be created.
 *
 * @param medplum - Medplum Client to create the medication in your project
 * @param rxcui - The RXCUI code of the medication
 * @param medicationName - The name of the medication, used to display it in the reference
 * @returns The created FHIR Medication resource if it can be created
 */
async function createMedicationKnowledge(
  medplum: MedplumClient,
  rxcui?: string,
  medicationName?: string
): Promise<MedicationKnowledge> {
  if (!rxcui) {
    throw new Error('Unable to create a MedicationKnowledge resource');
  }

  const coding: Coding = { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: rxcui };
  if (medicationName) {
    coding.display = medicationName;
  }

  const medicationData: MedicationKnowledge = {
    resourceType: 'MedicationKnowledge',
    code: { coding: [coding] },
    status: 'active',
  };

  const medicationKnowledge = await medplum.createResource(medicationData);
  return medicationKnowledge;
}

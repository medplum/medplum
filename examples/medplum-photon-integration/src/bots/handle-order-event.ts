// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BotEvent, createReference, MedplumClient, normalizeErrorString } from '@medplum/core';
import { MedicationDispense, MedicationRequest, Patient, Reference } from '@medplum/fhirtypes';
import { Fill, OrderCreatedData, OrderData, PhotonEvent } from '../photon-types';
import { NEUTRON_HEALTH } from './constants';
import { handlePhotonAuth, photonGraphqlFetch } from './utils';

export async function handler(
  medplum: MedplumClient,
  event: BotEvent<PhotonEvent>
): Promise<MedicationDispense[] | undefined> {
  const body = event.input;
  if (body.type !== 'photon:order:created') {
    return undefined;
  }

  const PHOTON_CLIENT_ID = event.secrets['PHOTON_CLIENT_ID']?.valueString;
  const PHOTON_CLIENT_SECRET = event.secrets['PHOTON_CLIENT_SECRET']?.valueString;
  const PHOTON_AUTH_TOKEN = await handlePhotonAuth(PHOTON_CLIENT_ID, PHOTON_CLIENT_SECRET);

  const data = body.data;

  const photonPatientData = data.patient;
  const patient = await getPatient(photonPatientData, medplum);

  if (!patient) {
    throw new Error('No linked patient');
  }

  const dispenses = handleOrderCreatedEvent(data as OrderCreatedData, PHOTON_AUTH_TOKEN, medplum, patient);
  return dispenses;
}

async function handleOrderCreatedEvent(
  data: OrderCreatedData,
  authToken: string,
  medplum: MedplumClient,
  patient: Patient
): Promise<MedicationDispense[]> {
  const fills = data.fills;
  const orderId = data.id;
  const dispenses: MedicationDispense[] = [];

  for (const fill of fills) {
    const id = fill.id as string;
    const processedDispense = await checkForDuplicateFill(medplum, id);
    if (processedDispense) {
      continue;
    }
    const fillData = await getFill(id, authToken);
    const prescriptionData = fill.prescription;
    const prescription: MedicationRequest | undefined = await getAuthorizingPrescription(medplum, prescriptionData?.id);
    if (!prescription) {
      throw new Error('Medication could not be dispensed as there is no authorizing prescription');
    }

    const dispense = await createMedicationDispense(fillData, medplum, prescription, patient);
    await updatePrescription(prescription, medplum, orderId);
    dispenses.push(dispense);
  }

  return dispenses;
}

async function checkForDuplicateFill(medplum: MedplumClient, fillId: string): Promise<boolean> {
  const processedDispense = await medplum.searchOne('MedicationDispense', {
    identifier: NEUTRON_HEALTH + `|${fillId}`,
  });

  return !!processedDispense;
}

async function updatePrescription(
  prescription: MedicationRequest,
  medplum: MedplumClient,
  orderId: string
): Promise<void> {
  const identifier = prescription.identifier ?? [];
  identifier.push({ system: NEUTRON_HEALTH, value: orderId });
  const status = prescription.status === 'draft' ? 'active' : prescription.status;
  const udpatedPrescriptionData: MedicationRequest = {
    ...prescription,
    identifier,
    status,
  };

  try {
    await medplum.updateResource(udpatedPrescriptionData);
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

/**
 * This creates new MedicationDispense resources to represent the fills included in a Photon order created event.
 *
 * @param fill - The fill data from the Photon order created event
 * @param medplum - The MedplumClient
 * @param request - The MedicationRequest that authorizes the MedicationDispense/Fill
 * @param patient - The patient that the dispense is for
 * @returns The created MedicationDispense
 */
async function createMedicationDispense(
  fill: Fill,
  medplum: MedplumClient,
  request: MedicationRequest,
  patient: Patient
): Promise<MedicationDispense> {
  // The partial fills from the created event only have ids, so we need to query for the expanded details from Photon
  // Search for the prescription linked to the fills
  const prescription = await medplum.searchOne('MedicationRequest', {
    identifier: NEUTRON_HEALTH + `|${fill.prescription?.id ?? ''}`,
  });
  const patientRef = createReference(patient);

  const pharmacy = request.dispenseRequest?.performer;
  const performer: MedicationDispense['performer'] = [];
  if (pharmacy) {
    performer.push({ actor: pharmacy });
  }

  const medication = request.medicationCodeableConcept ?? {
    coding: [
      {
        system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
        code: fill.treatment?.codes.rxcui,
        display: fill.treatment?.name,
      },
    ],
  };

  // Link the dispense to the prescription if it exists
  const authorizingPrescription: Reference<MedicationRequest>[] = [];
  if (prescription) {
    authorizingPrescription.push(createReference(prescription));
  }

  // Build the MedicationDispense object
  const medicationDispenseData: MedicationDispense = {
    resourceType: 'MedicationDispense',
    status: getFillStatus(fill.state),
    identifier: [{ system: NEUTRON_HEALTH, value: fill.id }],
    authorizingPrescription,
    medicationCodeableConcept: medication,
    performer,
    subject: patientRef,
  };

  if (fill.filledAt) {
    medicationDispenseData.whenPrepared = fill.filledAt;
  }

  // Create and return the MedicationDispense
  try {
    const medicationDispense = await medplum.createResource(medicationDispenseData);
    return medicationDispense;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

export function getFillStatus(fillState: Fill['state']): MedicationDispense['status'] {
  switch (fillState) {
    case 'NEW':
      return 'in-progress';
    case 'SCHEDULED':
      return 'preparation';
    case 'SENT':
      return 'in-progress';
    case 'CANCELED':
      return 'cancelled';
    default:
      throw new Error('Invalid Fill state');
  }
}

async function getFill(id: string, authToken: string): Promise<Fill> {
  const query = `
      query fill($id: ID!) {
        fill(id: $id) {
          id
          treatment {
            id
            name
            codes {
              rxcui
            }
          }
          prescription {
            id
            externalId
          }
          state
          requestedAt
          filledAt
          order {
            id
          }
        }
      }
    `;

  const variables = { id };
  const body = JSON.stringify({ query, variables });
  const result = await photonGraphqlFetch(body, authToken);
  return result.data.fill;
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
  const id = patientData.externalId as string;
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
  try {
    patient = await medplum.readResource('Patient', id);
    return patient;
  } catch {
    return undefined;
  }
}

async function getAuthorizingPrescription(
  medplum: MedplumClient,
  photonId?: string
): Promise<MedicationRequest | undefined> {
  if (!photonId) {
    return undefined;
  }
  const authorizingPrescription = await medplum.searchOne('MedicationRequest', {
    identifier: NEUTRON_HEALTH + `|${photonId}`,
  });

  return authorizingPrescription;
}

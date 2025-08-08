// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BotEvent, createReference, MedplumClient, normalizeErrorString, PatchOperation } from '@medplum/core';
import { CodeableConcept, Coding, MedicationKnowledge, MedicationRequest, Practitioner } from '@medplum/fhirtypes';
import {
  PhotonEvent,
  PrescriptionCreatedData,
  PrescriptionDepletedEvent,
  PrescriptionExpiredEvent,
} from '../photon-types';
import { NEUTRON_HEALTH, NEUTRON_HEALTH_WEBHOOKS } from './constants';
import {
  checkForDuplicateEvent,
  getExistingMedicationRequest,
  getMedicationKnowledge,
  getPatient,
  handlePhotonAuth,
  photonGraphqlFetch,
} from './utils';

interface MedicationDetails {
  name: string;
  rxcui?: string;
}

export async function handler(medplum: MedplumClient, event: BotEvent<PhotonEvent>): Promise<MedicationRequest> {
  const body = event.input;

  // Photon sends a signature that you can use to verify that the webhook is valid. However, Medplum does not currently pass the  necessary information to verify the event to the bot. Once this is implemented, this will be updated to include an event verification step.

  // Ensure that only prescription events are being handled
  if (!body.type.includes('prescription')) {
    throw new Error('Not a prescription event');
  }

  // If the event is not to create a new prescription, make sure the prescription to update exists
  const existingPrescription = await getExistingMedicationRequest(body.data, medplum);
  if (!existingPrescription && body.type !== 'photon:prescription:created') {
    throw new Error('Prescription does not exist');
  }

  // Photon notes that webhooks may be duplicated. This checks if the current event has already been processed
  const isDuplicateEvent = checkForDuplicateEvent(body, existingPrescription);

  // If it is a dupe, return the already processed prescription
  if (isDuplicateEvent && existingPrescription) {
    return existingPrescription;
  }

  // Handle authorization to access the Photon API
  const PHOTON_CLIENT_ID = event.secrets['PHOTON_CLIENT_ID']?.valueString;
  const PHOTON_CLIENT_SECRET = event.secrets['PHOTON_CLIENT_SECRET']?.valueString;
  const PHOTON_AUTH_TOKEN = await handlePhotonAuth(PHOTON_CLIENT_ID, PHOTON_CLIENT_SECRET);

  const { name, rxcui } = await getMedicationDetailsFromPrescription(body.data.id, PHOTON_AUTH_TOKEN);

  // Create or update the prescription, depending on the event type
  let prescription: MedicationRequest;
  if (body.type === 'photon:prescription:created') {
    prescription = await handleCreatePrescription(body, medplum, PHOTON_AUTH_TOKEN, rxcui, name);
  } else if (body.type === 'photon:prescription:depleted' || body.type === 'photon:prescription:expired') {
    prescription = await handleUpdatePrescription(body, medplum, existingPrescription);
  } else {
    throw new Error('Invalid prescription type');
  }

  return prescription;
}

async function getMedicationDetailsFromPrescription(
  photonPrescriptionId: string,
  authToken: string
): Promise<MedicationDetails> {
  const query = `
    query prescription($id: ID!) {
      prescription(id: $id) {
        treatment {
          name
          codes {
            rxcui
          }
        }
      }
    }
  `;

  const variables = { id: photonPrescriptionId };

  const body = JSON.stringify({ query, variables });
  const result = await photonGraphqlFetch(body, authToken);
  const rxcui = result.data?.prescription?.treatment?.codes?.rxcui;
  const name = result.data?.prescription?.treatment?.name;
  return { name, rxcui };
}

/**
 * Takes an existing prescription and updates it with data from the incoming webhook event.
 *
 * @param body - The webhook body data
 * @param medplum - Medplum Client to update the resource in your project
 * @param existingPrescription - The existing prescription that is being updated
 * @returns The updated prescription
 */
export async function handleUpdatePrescription(
  body: PrescriptionDepletedEvent | PrescriptionExpiredEvent,
  medplum: MedplumClient,
  existingPrescription?: MedicationRequest
): Promise<MedicationRequest> {
  if (!existingPrescription) {
    throw new Error('No prescription to update');
  }

  const updatedStatus = body.type === 'photon:prescription:depleted' ? 'completed' : 'stopped';
  const identifiers = existingPrescription.identifier ?? [];
  identifiers.push({ system: NEUTRON_HEALTH_WEBHOOKS, value: body.id });
  const op = 'add';

  const id = existingPrescription.id as string;
  const ops: PatchOperation[] = [
    { op: 'test', path: '/meta/versionId', value: existingPrescription.meta?.versionId },
    { op: 'replace', path: '/status', value: updatedStatus },
    { op, path: '/identifier', value: identifiers },
  ];

  try {
    const result = await medplum.patchResource('MedicationRequest', id, ops);
    return result;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

/**
 * Takes the data from the incoming webhook and uses it to create a prescription modeled as a FHIR MedicationRequest resource.
 *
 * @param event - The webhook event with the details needed to create the prescription
 * @param medplum - Medplum Client to create the prescription in your project
 * @param authToken - Photon auth token to authorize GraphQL queries
 * @param medicationCode - The RXCUI code for the medication
 * @param medicationName - The name of the medication for display
 * @returns The created prescription as MedicationRequest resource
 */
export async function handleCreatePrescription(
  event: PhotonEvent,
  medplum: MedplumClient,
  authToken: string,
  medicationCode?: string,
  medicationName?: string
): Promise<MedicationRequest> {
  const data = event.data as PrescriptionCreatedData;
  // Get the prescribing practitioner and the medication from Medplum
  const prescriber = await getPrescriber(data, medplum, authToken);
  // const medicationRxcui = await getPhotonMedicationCode(data.treatmentId, authToken);
  const patient = await getPatient(data.patient, medplum);
  if (!patient) {
    throw new Error('No patient to link prescription to.');
  }

  const subject = createReference(patient);

  const medicationElement = await getMedicationElement(medplum, medicationCode, medicationName);

  const medicationRequest: MedicationRequest = {
    resourceType: 'MedicationRequest',
    status: 'draft',
    intent: 'order',
    subject,
    identifier: [
      { system: NEUTRON_HEALTH_WEBHOOKS, value: event.id },
      { system: NEUTRON_HEALTH, value: data.id },
    ],
    dispenseRequest: {
      quantity: {
        value: data.dispenseQuantity,
        unit: data.dispenseUnit,
      },
      numberOfRepeatsAllowed: data.refillsAllowed,
      expectedSupplyDuration: { value: data.daysSupply, unit: 'days' },
      validityPeriod: {
        start: data.effectiveDate,
        end: data.expirationDate,
      },
    },
    substitution: { allowedBoolean: !data.dispenseAsWritten },
    dosageInstruction: [{ patientInstruction: data.instructions }],
    medicationCodeableConcept: medicationElement,
    authoredOn: new Date().toISOString(),
  };

  if (data.notes) {
    medicationRequest.note = [{ text: data.notes }];
  }

  if (prescriber) {
    medicationRequest.requester = createReference(prescriber);
  }

  try {
    const result = await medplum.createResource(medicationRequest);
    return result;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

async function getMedicationElement(
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

/**
 * Takes the webhook data to finds the corresponding prescriber in your project.
 *
 * @param prescriptionData - The data from a Photon prescription created event
 * @param medplum - Medplum Client to search for existing prescribers and save to your project
 * @param authToken - Photon auth token to authorize GrapahQL queries
 * @returns The prescriber from your project, if it exists, modeled as a FHIR Practitioner resource
 */
async function getPrescriber(
  prescriptionData: PrescriptionCreatedData,
  medplum: MedplumClient,
  authToken: string
): Promise<Practitioner | undefined> {
  const prescriberId = prescriptionData.prescriberId;
  // Search for an existing practitioner with a photon identifier
  const trackedPractitioner = await medplum.searchOne('Practitioner', {
    identifier: NEUTRON_HEALTH + `|${prescriberId}`,
  });

  // Return the practitioner if they are already tracked in Medplum
  if (trackedPractitioner) {
    return trackedPractitioner;
  }

  // Otherwise query for the practitioner in Photon to get additional details to search on
  // We will get the external ID (Medplum ID) and the email
  const query = `
    query prescription($id: ID!) {
      prescription(id: $id) {
        prescriber {
          externalId
          email
        }
      }
    }
  `;

  const variables = { id: prescriptionData.id };
  const body = JSON.stringify({ query, variables });

  try {
    const result = await photonGraphqlFetch(body, authToken);

    const practitionerId = result.data?.prescriber?.externalId;
    const practitionerEmail = result.data?.prescriber?.email;

    const practitioner = await medplum.searchOne('Practitioner', {
      _filter: `(_id eq ${practitionerId} or email eq ${practitionerEmail})`,
    });

    return practitioner;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

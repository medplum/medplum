import { BotEvent, getReferenceString, MedplumClient, normalizeErrorString, PatchOperation } from '@medplum/core';
import { MedicationKnowledge, MedicationRequest, Practitioner } from '@medplum/fhirtypes';
import {
  PhotonEvent,
  PhotonWebhook,
  PrescriptionCreatedData,
  PrescriptionDepletedEvent,
  PrescriptionExpiredEvent,
} from '../photon-types';
import {
  checkForDuplicateEvent,
  getExistingMedicationRequest,
  handlePhotonAuth,
  photonGraphqlFetch,
  verifyEvent,
} from './utils';
import { NEUTRON_HEALTH, NEUTRON_HEALTH_WEBHOOKS } from './system-strings';

export async function handler(medplum: MedplumClient, event: BotEvent<PhotonWebhook>): Promise<MedicationRequest> {
  const webhook = event.input;
  // Get the webhook secret and use it to verify that this is a valid Photon event
  const PHOTON_WEBHOOK_SECRET = event.secrets['PHOTON_PRESCRIPTION_WEBHOOK_SECRET']?.valueString ?? '';
  const isValid = verifyEvent(webhook, PHOTON_WEBHOOK_SECRET);
  if (!isValid) {
    throw new Error('Not a valid Photon Webhook Event');
  }

  const body = webhook.body;

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
  const isDuplicateEvent = checkForDuplicateEvent(webhook, existingPrescription);

  // If it is a dupe, return the already processed prescription
  if (isDuplicateEvent && existingPrescription) {
    return existingPrescription;
  }

  // Handle authorization to access the Photon API
  const PHOTON_CLIENT_ID = event.secrets['PHOTON_CLIENT_ID']?.valueString;
  const PHOTON_CLIENT_SECRET = event.secrets['PHOTON_CLIENT_SECRET']?.valueString;
  const PHOTON_AUTH_TOKEN = await handlePhotonAuth(PHOTON_CLIENT_ID, PHOTON_CLIENT_SECRET);

  // Create or update the prescription, depending on the event type
  let prescription: MedicationRequest;
  if (body.type === 'photon:prescription:created') {
    prescription = await handleCreatePrescription(body, medplum, PHOTON_AUTH_TOKEN);
  } else if (body.type === 'photon:prescription:depleted' || body.type === 'photon:prescription:expired') {
    prescription = await handleUpdatePrescription(body, medplum, existingPrescription);
  } else {
    throw new Error('Invalid prescription type');
  }

  return prescription;
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

  const id = body.data.externalId as string;
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
 * @returns The created prescription as MedicationRequest resource
 */
export async function handleCreatePrescription(
  event: PhotonEvent,
  medplum: MedplumClient,
  authToken: string
): Promise<MedicationRequest> {
  const data = event.data as PrescriptionCreatedData;
  // Get the prescribing practitioner and the medication from Medplum
  const prescriber = await getPrescriber(data, medplum, authToken);
  let medication: MedicationKnowledge | undefined = await getMedicationKnowledge(data.medicationId, medplum, authToken);

  if (!medication) {
    medication = await createMedicationKnowledge(data, medplum, authToken);
  }

  const medicationRequest: MedicationRequest = {
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    subject: { reference: `Patient/${data.patient.externalId}` },
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
    note: [{ text: data.notes }],
  };

  if (medication) {
    medicationRequest.medicationCodeableConcept = medication.code;
  }

  if (prescriber) {
    medicationRequest.requester = { reference: getReferenceString(prescriber) };
  }

  try {
    const result = await medplum.createResource(medicationRequest);
    return result;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

/**
 * Takes data from a Photon prescription created event and creates a FHIR Medication resource in your project. If there is no
 * linked RX Norm code, the Medication will not be created.
 *
 * @param data - Webhook data from a Photon prescription created event
 * @param medplum - Medplum Client to create the medication in your project
 * @param authToken - Photon auth token to authorize GraphQL queries
 * @returns The created FHIR Medication resource if it can be created
 */
async function createMedicationKnowledge(
  data: PrescriptionCreatedData,
  medplum: MedplumClient,
  authToken: string
): Promise<MedicationKnowledge | undefined> {
  const medicationCode = await getPhotonMedicationCode(data.medicationId, authToken);
  if (!medicationCode) {
    return undefined;
  }

  const medicationData: MedicationKnowledge = {
    resourceType: 'MedicationKnowledge',
    code: { coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: medicationCode }] },
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

    const practitionerId = result.data.prescriber.externalId;
    const practitionerEmail = result.data.prescriber.email;

    const practitioner = await medplum.searchOne('Practitioner', {
      _filter: `(_id eq ${practitionerId} or email eq ${practitionerEmail})`,
    });

    return practitioner;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

async function getPhotonMedicationCode(photonMedicationId: string, authToken: string): Promise<string | undefined> {
  const query = `
    query medicationProducts($id: String!) {
      medicationProducts(id: $id) {
        codes {
          rxcui
        }
      }
    }
  `;

  const variables = { id: photonMedicationId };
  const body = JSON.stringify({ query, variables });

  try {
    const result = await photonGraphqlFetch(body, authToken);
    const rxcui = result.data.medicationProducts?.[0].codes?.rxcui;
    return rxcui;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

/**
 * Takes data from the webhook to find the corresponding Medication resource in your project.
 *
 * @param photonMedicationId - The id of the medication stored in Photon
 * @param medplum - Medplum Cient to search for the medication in your project
 * @param authToken - Photon auth token to authorize GraphQL queries
 * @returns The Medication resource from your project if it exists
 */
async function getMedicationKnowledge(
  photonMedicationId: string,
  medplum: MedplumClient,
  authToken: string
): Promise<MedicationKnowledge | undefined> {
  const trackedMedication = await medplum.searchOne('MedicationKnowledge', {
    identifier: NEUTRON_HEALTH + `|${photonMedicationId}`,
  });

  if (trackedMedication) {
    return trackedMedication;
  }

  try {
    const rxcui = await getPhotonMedicationCode(photonMedicationId, authToken);
    const medication = await medplum.searchOne('MedicationKnowledge', {
      code: rxcui,
    });

    return medication;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

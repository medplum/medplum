import { BotEvent, getReferenceString, MedplumClient, normalizeErrorString, PatchOperation } from '@medplum/core';
import { Medication, MedicationRequest, Practitioner } from '@medplum/fhirtypes';
import { createHmac } from 'crypto';
import {
  PhotonEvent,
  PhotonWebhook,
  PrescriptionCreatedData,
  PrescriptionDepletedEvent,
  PrescriptionExpiredEvent,
} from '../photon-types';
import { checkForDuplicateEvent, handlePhotonAuth, photonGraphqlFetch } from './utils';

export async function handler(medplum: MedplumClient, event: BotEvent<PhotonWebhook>): Promise<MedicationRequest> {
  const webhook = event.input;
  const PHOTON_WEBHOOK_SECRET = event.secrets['PHOTON_PRESCRIPTION_WEBHOOK_SECRET']?.valueString ?? '';
  const isValid = verifyEvent(webhook, PHOTON_WEBHOOK_SECRET);
  if (!isValid) {
    throw new Error('Not a valid Photon Webhook Event');
  }

  const body = webhook.body;

  if (!body.type.includes('prescription')) {
    throw new Error('Not a prescription event');
  }

  const existingPrescription = await getExistingPrescription(body.data, medplum);
  if (!existingPrescription && body.type !== 'photon:prescription:created') {
    throw new Error('Prescription does not exist');
  }

  const dupe = checkForDuplicateEvent(webhook, existingPrescription);

  if (dupe && existingPrescription) {
    return existingPrescription;
  }

  const PHOTON_CLIENT_ID = event.secrets['PHOTON_CLIENT_ID']?.valueString;
  const PHOTON_CLIENT_SECRET = event.secrets['PHOTON_CLIENT_SECRET']?.valueString;
  const PHOTON_AUTH_TOKEN = await handlePhotonAuth(PHOTON_CLIENT_ID, PHOTON_CLIENT_SECRET);

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

function verifyEvent(photonEvent: PhotonWebhook, secret: string): boolean {
  const signature = photonEvent.headers['X-Photon-Signature'];
  const body = photonEvent.body;

  const hmac = createHmac('sha256', secret);
  const digest = hmac.update(JSON.stringify(body)).digest('hex');

  return digest === signature;
}

export async function getExistingPrescription(
  data: PhotonEvent['data'],
  medplum: MedplumClient
): Promise<MedicationRequest | undefined> {
  const id = data.externalId;
  const photonId = data.id;

  let existingPrescription = await medplum.searchOne('MedicationRequest', {
    _id: id,
  });

  if (existingPrescription) {
    return existingPrescription;
  }

  existingPrescription = await medplum.searchOne('MedicationRequest', {
    identifier: `https://neutron.health|${photonId}`,
  });

  return existingPrescription;
}

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
  identifiers.push({ system: 'https://neutron.health/webhooks', value: body.id });
  const op = existingPrescription.identifier ? 'replace' : 'add';

  const id = body.data.externalId;
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

export async function handleCreatePrescription(
  event: PhotonEvent,
  medplum: MedplumClient,
  authToken: string
): Promise<MedicationRequest> {
  const data = event.data as PrescriptionCreatedData;
  // Get the prescribing practitioner and the medication from Medplum
  const prescriber = await getPrescriber(data, medplum, authToken);
  const medication = await getMedication(data.medicationId, medplum, authToken);

  const medicationRequest: MedicationRequest = {
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    subject: { reference: `Patient/${data.patient.externalId}` },
    identifier: [{ system: 'https://neutron.health/webhooks', value: event.id }],
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
    substitution: { allowedBoolean: data.dispenseAsWritten },
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

async function getPrescriber(
  prescriptionData: PrescriptionCreatedData,
  medplum: MedplumClient,
  authToken: string
): Promise<Practitioner | undefined> {
  const prescriberId = prescriptionData.prescriberId;
  // Search for an existing practitioner with a photon identifier
  const trackedPractitioner = await medplum.searchOne('Practitioner', {
    identifier: `https://neutron.health|${prescriberId}`,
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
async function getMedication(
  photonMedicationId: string,
  medplum: MedplumClient,
  authToken: string
): Promise<Medication | undefined> {
  const trackedMedication = await medplum.searchOne('Medication', {
    identifier: `https://neutron.health|${photonMedicationId}`,
  });

  if (trackedMedication) {
    return trackedMedication;
  }

  const query = `
    query medicationProducts($id: string) {
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
    const rxcui = result.data.medicationProducts?.[0].codes?.rxcui ?? '';

    const medication = await medplum.searchOne('Medication', {
      code: rxcui,
    });

    return medication;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

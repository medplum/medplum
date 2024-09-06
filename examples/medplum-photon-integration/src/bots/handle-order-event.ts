import { BotEvent, getReferenceString, MedplumClient, normalizeErrorString, PatchOperation } from '@medplum/core';
import {
  Identifier,
  MedicationDispense,
  MedicationRequest,
  MedicationRequestDispenseRequest,
  Organization,
  Patient,
  Reference,
  SupplyDelivery,
} from '@medplum/fhirtypes';
import {
  Fill,
  OrderCreatedData,
  OrderData,
  OrderErrorData,
  OrderEvent,
  OrderEventType,
  OrderFulfillmentData,
  OrderReroutedData,
  PhotonPrescription,
  PhotonWebhook,
} from '../photon-types';
import { NEUTRON_HEALTH, NEUTRON_HEALTH_WEBHOOKS } from './system-strings';
import { getExistingMedicationRequest, handlePhotonAuth, photonGraphqlFetch, verifyEvent } from './utils';

export async function handler(
  medplum: MedplumClient,
  event: BotEvent<PhotonWebhook>
): Promise<MedicationRequest | undefined> {
  const webhook = event.input;
  // You will need to set up the webhook secret in your Medplum project. Per the photon docs, if there is no secret, an empty string should be used.
  const PHOTON_WEBHOOK_SECRET = event.secrets['PHOTON_ORDER_WEBHOOK_SECRET']?.valueString ?? '';

  // Ensure the webhook is coming from Photon
  const isValid = verifyEvent(webhook, PHOTON_WEBHOOK_SECRET);
  if (!isValid) {
    throw new Error('Not a valid Photon Webhook Event');
  }

  // Ensure the user has proper authorization to access photon
  const PHOTON_CLIENT_ID = event.secrets['PHOTON_CLIENT_ID']?.valueString;
  const PHOTON_CLIENT_SECRET = event.secrets['PHOTON_CLIENT_SECRET']?.valueString;
  const PHOTON_AUTH_TOKEN = await handlePhotonAuth(PHOTON_CLIENT_ID, PHOTON_CLIENT_SECRET);

  const body = webhook.body as OrderEvent;
  const data = body.data as OrderData;
  // Search for an existing request
  const existingRequest = await getExistingMedicationRequest(data, medplum);
  // Check that the incoming photon event is not a duplicate
  const dupe = checkForDuplicateEvent(webhook, existingRequest);

  if (dupe && existingRequest) {
    return existingRequest;
  }

  // Get the patient linked to this order
  const photonPatientData = body.data.patient;
  const patient = await getPatient(photonPatientData, medplum);

  if (!patient) {
    throw new Error('No patient linked to order');
  }

  // If no existing request create one, otherwise update it
  if (!existingRequest) {
    const newRequest = await createMedicationRequest(body, medplum, PHOTON_AUTH_TOKEN, patient);
    return newRequest;
  } else {
    const updatedRequest = await updateMedicationRequest(body, medplum, PHOTON_AUTH_TOKEN, existingRequest);
    return updatedRequest;
  }
}

/**
 * Takes an existing MedicationRequest resource and updates it based on the event type
 *
 * @param body - The body of the webhook
 * @param medplum - The MedplumClient
 * @param authToken - Photon auth token to handle GraphQL queries
 * @param existingRequest - An already existing MedicationRequest resource to update
 * @returns The updated MedicationRequest resource
 */
export async function updateMedicationRequest(
  body: OrderEvent,
  medplum: MedplumClient,
  authToken: string,
  existingRequest: MedicationRequest
): Promise<MedicationRequest> {
  // Check if the status of the medication request needs to be updated
  const updateStatus = checkForStatusUpdate(body.type, existingRequest.status);

  const identifier: Identifier[] = existingRequest.identifier ?? [];
  identifier.push({ system: NEUTRON_HEALTH_WEBHOOKS, value: body.id });

  // Create a medication request to hold the data and update the status if necessary
  const updatedRequestData: MedicationRequest = { ...existingRequest, identifier };
  if (updateStatus) {
    updatedRequestData.status = getStatus(body.type);
  }

  let updatedRequest: MedicationRequest;

  // Update the request based on the event type
  switch (body.type) {
    case 'photon:order:created':
      updatedRequest = await handleCreatedData(body.data, updatedRequestData, authToken, medplum);
      break;
    case 'photon:order:rerouted':
      updatedRequest = await handleReroutedData(body.data, updatedRequestData, authToken, medplum);
      break;
    case 'photon:order:error':
      updatedRequest = handleErrorData(body.data, updatedRequestData);
      break;
    default:
      updatedRequest = { ...updatedRequestData };
      break;
  }

  // Update the resource
  try {
    return await medplum.updateResource(updatedRequest);
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

/**
 * Photon does not guarantee that order event webhooks will be received in the correct order. Because of this, we must ensure
 * that we are not going backwards when updating the status. This function checks the type of event and the status of the
 * MedicationRequest to determine if the status should be updated.
 *
 * @param orderType - The type of webhook event that was received
 * @param status - The current status of the MedicationRequest
 * @returns - A boolean representing whether the status needs to be updated
 */
export function checkForStatusUpdate(orderType: OrderEventType, status: MedicationRequest['status']): boolean {
  // If status is currently active and updating to completed, canceled, or an error, it should be updated.
  // Otherwise the status does not need to be updated
  if (
    status === 'active' &&
    (orderType === 'photon:order:completed' ||
      orderType === 'photon:order:canceled' ||
      orderType === 'photon:order:error')
  ) {
    return true;
  } else {
    return false;
  }
}

/**
 * This takes the webhook data and uses it to create a MedicationRequest to represent the order received.
 *
 * @param body - The body of the webhook
 * @param medplum - The MedplumClient
 * @param authToken - Photon auth token to handle GraphQL queries
 * @param patient - The subject of the MedicationRequest
 * @returns The created MedicationRequest
 */
export async function createMedicationRequest(
  body: OrderEvent,
  medplum: MedplumClient,
  authToken: string,
  patient: Patient
): Promise<MedicationRequest> {
  // Get the proper status to set the request to
  const status = getStatus(body.type);

  // Create a base resource that additional data can be added to
  const medicationRequestData: MedicationRequest = {
    resourceType: 'MedicationRequest',
    status,
    intent: 'order',
    subject: { reference: getReferenceString(patient) },
    identifier: [
      { system: NEUTRON_HEALTH, value: body.data.id },
      { system: NEUTRON_HEALTH_WEBHOOKS, value: body.id },
    ],
  };

  let medicationRequest: MedicationRequest;

  // Add the additional data based on the event type and create the MedicationRequest in your project
  if (body.type === 'photon:order:created') {
    const createdDataRequest = await handleCreatedData(body.data, medicationRequestData, authToken, medplum);
    medicationRequest = await medplum.createResource(createdDataRequest);
    // Handle the fill data that is included on order created events
    await handleFills(body.data.fills, medicationRequest, medplum, authToken);
    return medicationRequest;
  } else if (body.type === 'photon:order:rerouted') {
    medicationRequest = await handleReroutedData(body.data, medicationRequestData, authToken, medplum);
  } else if (body.type === 'photon:order:error') {
    medicationRequest = handleErrorData(body.data, medicationRequestData);
  } else {
    medicationRequest = medicationRequestData;
  }

  // For fulfillment events, no additional data needs to be added to the MedicationRequest, but a SupplyDelivery resource
  // must be created to track the shipment of the medication
  if (body.type === 'photon:order:fulfillment') {
    await handleFulfillment(medicationRequest, medplum, body.data.fulfillment);
  }

  try {
    return await medplum.createResource(medicationRequest);
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

/**
 * This request takes the fills from a Photon order created event and creates or updates MedicationDispense resources
 * for each of them.
 *
 * @param fills - The Fills data included on a Photon order created event
 * @param request - The MedicationRequest the fills should be linked to
 * @param medplum - The MedplumClient used to create the fills in FHIR/Medplum
 * @param authToken - Photon auth token to authorize any GraphQL queries
 */
async function handleFills(
  fills: OrderCreatedData['fills'],
  request: MedicationRequest,
  medplum: MedplumClient,
  authToken: string
): Promise<void> {
  // Loop over each fill and either create or update the relevant MedicationDispense resource
  for (const fill of fills) {
    const existingFill = await getExistingFill(fill, medplum);
    if (existingFill) {
      await updateExistingFill(existingFill, request, medplum);
    } else {
      await createMedicationDispense(fill, medplum, request, authToken);
    }
  }
}

/**
 * This creates new MedicationDispense resources to represent the fills included in a Photon order created event.
 *
 * @param fill - The fill data from the Photon order created event
 * @param medplum - The MedplumClient
 * @param request - The MedicationRequest that authorizes the MedicationDispense/Fill
 * @param authToken - The Photon auth token to allow any GraphQL queries
 * @returns The created MedicationDispense
 */
async function createMedicationDispense(
  fill: Partial<Fill>,
  medplum: MedplumClient,
  request: MedicationRequest,
  authToken: string
): Promise<MedicationDispense> {
  // The partial fills from the created event only have ids, so we need to query for the expanded details from Photon
  const fillData = await getPhotonFillData(fill, authToken);
  // Search for the prescription linked to the fills
  const prescription = await medplum.searchOne('MedicationRequest', {
    identifier: NEUTRON_HEALTH + `|${fillData.prescription?.id ?? ''}`,
  });

  const pharmacy = request.dispenseRequest?.performer;
  const performer: MedicationDispense['performer'] = [];
  if (pharmacy) {
    performer.push({ actor: pharmacy });
  }

  // Link the dispense to the prescription if it exists
  const authorizingPrescription: Reference<MedicationRequest>[] = [{ reference: getReferenceString(request) }];
  if (prescription) {
    authorizingPrescription.push({ reference: getReferenceString(prescription) });
  }

  // Build the MedicationDispense object
  const medicationDispenseData: MedicationDispense = {
    resourceType: 'MedicationDispense',
    status: getFillStatus(fillData.state),
    identifier: [{ system: NEUTRON_HEALTH, value: fillData.id }],
    authorizingPrescription,
    medicationCodeableConcept: {
      coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: fill.treatment?.codes.rxcui }],
    },
    whenPrepared: fillData.filledAt,
    performer,
  };

  // Create and return the MedicationDispense
  try {
    const medicationDispense = await medplum.createResource(medicationDispenseData);
    return medicationDispense;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

function getFillStatus(fillState: Fill['state']): MedicationDispense['status'] {
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

/**
 * Takes the partial fill data from a Photon order created event and queries for the full details of the fill.
 *
 * @param fill - Fill data from an order created event
 * @param authToken - The photon auth token to authenticate the GraphQL query
 * @returns A fully detailed Photon Fill datatype
 */
async function getPhotonFillData(fill: Partial<Fill>, authToken: string): Promise<Fill> {
  if (!fill.id) {
    throw new Error('Cannot fetch fill data with no id');
  }
  const query = `
    query fill($id: ID!) {
      fill(id: $id) {
        id
        treatment {
          codes {
            rxcui
          }
        }
        prescription {
          id
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

  const variables = { id: fill.id };
  const body = JSON.stringify({ query, variables });
  const result = await photonGraphqlFetch(body, authToken);
  return result.data.fill as Fill;
}
/**
 * Takes an exisiting fill and udpates it to link it to a MedicationRequest as its authorizing prescription.
 *
 * @param existingFill - The MedicationDispense to be updated
 * @param request - The MedicationRequest the dispense will be linked t0
 * @param medplum - MedplumClient to persist changes to Medplum
 * @returns The updated MedicationDispense
 */
async function updateExistingFill(
  existingFill: MedicationDispense,
  request: MedicationRequest,
  medplum: MedplumClient
): Promise<MedicationDispense> {
  // Check if there is already a linked prescription
  const alreadyLinked = !!existingFill.authorizingPrescription?.find(
    (medRequest) => medRequest.reference === getReferenceString(request)
  );

  // If there is no linked prescription, update the dispense to link it to one
  if (!alreadyLinked) {
    const authorizingPrescriptions = existingFill.authorizingPrescription ?? [];
    authorizingPrescriptions.push({ reference: getReferenceString(request) });
    const op = existingFill.authorizingPrescription ? 'replace' : 'add';
    const ops: PatchOperation[] = [
      { op: 'test', path: '/meta/versionId', value: existingFill.meta?.versionId },
      { op, path: '/authorizingPrescription', value: authorizingPrescriptions },
    ];

    try {
      const updatedFill = await medplum.patchResource('MedicationDispense', existingFill.id as string, ops);
      return updatedFill;
    } catch (err) {
      throw new Error(normalizeErrorString(err));
    }
  } else {
    return existingFill;
  }
}

/**
 * Search for any existing MedicationDispense resources that represent a Fill in Photon.
 *
 * @param fill - The partial fill data from a Photon order created event
 * @param medplum - The MedplumClient used to search for existing fills
 * @returns A MedicationDispense that represents the fill if it exists
 */
async function getExistingFill(fill: Partial<Fill>, medplum: MedplumClient): Promise<MedicationDispense | undefined> {
  const photonId = fill.id;
  const existingFill = await medplum.searchOne('MedicationDispense', {
    identifier: NEUTRON_HEALTH + `|${photonId}`,
  });

  return existingFill;
}

/**
 * Updates a MedicationRequest to represent that there has been an error somewhere in the workflow.
 *
 * @param data - The data from a Photon order error event
 * @param request - The MedicationRequest to add the data to
 * @returns The MedicationRequest data updated to represent the error
 */
export function handleErrorData(data: OrderErrorData, request: MedicationRequest): MedicationRequest {
  const updatedRequest = { ...request };
  updatedRequest.statusReason = { coding: [{ system: NEUTRON_HEALTH, code: data.reason }] };
  return updatedRequest;
}

/**
 * Updates a MedicationRequest to represent that the order has been rerouted to a new pharmacy.
 *
 * @param data - The data from a Photon order rerouted event
 * @param request - The MedicationRequeset to add the data to
 * @param authToken - Photon auth token to handle any GraphQL queries
 * @param medplum - MedplumClient to search for existing resources in your project
 * @returns The MedicationRequest resource that has been updated to reflect the rerouted event.
 */
async function handleReroutedData(
  data: OrderReroutedData,
  request: MedicationRequest,
  authToken: string,
  medplum: MedplumClient
): Promise<MedicationRequest> {
  let pharmacy: Organization | undefined;
  pharmacy = await getPharmacy(medplum, authToken, data.pharmacy.id);

  if (!pharmacy) {
    pharmacy = await createPharmacy(data, medplum);
  }

  const updatedRequest = { ...request };

  const dispenseRequest = { ...request.dispenseRequest };
  dispenseRequest.performer = { reference: getReferenceString(pharmacy) };
  updatedRequest.dispenseRequest = dispenseRequest;
  return updatedRequest;
}

/**
 * Updates the data of a MedicationRequest resource to include the details from a Photon created event.
 *
 * @param createdData - The data from a Photon order created event
 * @param medicationRequest - The MedicationRequest to add the data to
 * @param authToken - Photon auth token to handle any GraphQL queries
 * @param medplum - MedplumClient to search for any resources in your project
 * @returns The MedicationRequest resource that has been updated to reflect the created event.
 */
async function handleCreatedData(
  createdData: OrderCreatedData,
  medicationRequest: MedicationRequest,
  authToken: string,
  medplum: MedplumClient
): Promise<MedicationRequest> {
  // Get the photon prescription
  const prescription = await getPrescription(createdData.fills, authToken);
  const linkedPrescription = await getLinkedPrescription(medplum, prescription);
  // Get the FHIR Organization resource for the pharmacy the order is going to
  const pharmacy = await getPharmacy(medplum, authToken, createdData.pharmacyId);
  const medication = prescription?.treatment.codes.rxcui;

  // Update the medication request
  medicationRequest.authoredOn = createdData.createdAt;
  medicationRequest.basedOn = [{ reference: getReferenceString(linkedPrescription) }];

  if (prescription) {
    medicationRequest.substitution = { allowedBoolean: prescription.dispenseAsWritten };
    medicationRequest.dosageInstruction = [{ patientInstruction: prescription.instructions }];
    medicationRequest.note = [{ text: prescription.notes ?? '' }];

    if (medication) {
      medicationRequest.medicationCodeableConcept = {
        coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: medication }],
      };
    }

    const dispenseRequest: MedicationRequestDispenseRequest = {
      quantity: {
        value: prescription.dispenseQuantity,
        unit: prescription.dispenseUnit,
      },
      numberOfRepeatsAllowed: prescription.refillsAllowed,
      expectedSupplyDuration: {
        value: prescription.daysSupply,
        unit: 'days',
      },
    };
    if (pharmacy) {
      dispenseRequest.performer = { reference: getReferenceString(pharmacy) };
    }

    medicationRequest.dispenseRequest = dispenseRequest;
  }

  return medicationRequest;
}

export async function getLinkedPrescription(
  medplum: MedplumClient,
  prescription?: PhotonPrescription
): Promise<MedicationRequest> {
  if (!prescription) {
    throw new Error('Order does not have a linked prescription');
  }

  const medicationRequest: MedicationRequest | undefined = await medplum.searchOne('MedicationRequest', {
    identifier: NEUTRON_HEALTH + `|${prescription.id}`,
  });

  if (!medicationRequest) {
    throw new Error('Linked prescription does not exist in Medplum');
  }

  return medicationRequest;
}

/**
 * Takes the pharmacy data from a Photon order rerouted event and creates the pharmacy in your Medplum project.
 *
 * @param data - The data from a Photon order rerouted event
 * @param medplum - MedplumClient to create the pharmacy
 * @returns The created pharmacy as a FHIR Organization resource
 */
async function createPharmacy(data: OrderReroutedData, medplum: MedplumClient): Promise<Organization> {
  const pharmacyData = data.pharmacy;
  const pharmacy: Organization = {
    resourceType: 'Organization',
    name: pharmacyData.name,
    identifier: [{ system: NEUTRON_HEALTH, value: pharmacyData.id }],
    type: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/organization-type',
            code: 'prov',
            display: 'Healthcare Provider',
          },
        ],
      },
    ],
  };
  try {
    return await medplum.createResource(pharmacy);
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

/**
 * Takes fulfillment data from photon health and creates a SupplyDelivery resource in your project which can be used to
 * track the shipment of the medication to a pharmacy or patient.
 *
 * @param request - The medication request that has the details of the medication being shipped
 * @param medplum - Medplum Client used to create the supply delivery in your project
 * @param fulfillment - The fulfillment data from Photon health
 */
async function handleFulfillment(
  request: MedicationRequest,
  medplum: MedplumClient,
  fulfillment: OrderFulfillmentData['fulfillment']
): Promise<void> {
  const supplyDelivery: SupplyDelivery = {
    resourceType: 'SupplyDelivery',
    identifier: [{ system: NEUTRON_HEALTH + `/${fulfillment.carrier}`, value: fulfillment.trackingNumber }],
    suppliedItem: {
      itemCodeableConcept: request.medicationCodeableConcept,
    },
    status: 'in-progress',
    type: {
      coding: [
        { system: 'http://hl7.org/fhir/supplydelivery-supplyitemtype', code: 'medication', display: 'Medication' },
      ],
    },
  };

  await medplum.createResource(supplyDelivery);
}

/**
 * Gets the status the MedicationRequest should have based on the Photon event type.
 *
 * @param eventType - The Photon order event type
 * @returns A MedicationRequest status
 */
export function getStatus(eventType: OrderEventType): MedicationRequest['status'] {
  switch (eventType) {
    case 'photon:order:canceled':
      return 'cancelled';
    case 'photon:order:completed':
      return 'completed';
    case 'photon:order:error':
      return 'cancelled';
    default:
      return 'active';
  }
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
  patient = await medplum.readResource('Patient', id);

  return patient;
}

/**
 * Gets a Photon prescription based on fills data from a Photon order created event.
 *
 * @param fills - The partial fill data from a Photon order created event
 * @param authToken - Photon auth token to authorize GraphQL queries
 * @returns Detailed Photon prescription data.
 */
async function getPrescription(
  fills: OrderCreatedData['fills'],
  authToken: string
): Promise<PhotonPrescription | undefined> {
  const prescriptionId = fills[0]?.prescription?.id;

  if (!prescriptionId) {
    return undefined;
  }

  const query = `
    query prescription($id: ID!) {
      prescription(id: $id) {
        id
        treatment {
          codes {
            rxcui
          }
        }
        dispenseAsWritten
        dispenseQuantity
        dispenseUnit
        refillsAllowed
        fillsAllowed
        fillsRemaining
        daysSupply
        instructions
        notes
      }
    }
  `;

  const variables = { id: prescriptionId };
  const body = JSON.stringify({ query, variables });

  const result = await photonGraphqlFetch(body, authToken);
  return result.data?.prescription;
}

/**
 * Takes the pharmacy data from Photon and searches for the Organization in your project.
 *
 * @param medplum - MedplumClient to search for the pharmacy
 * @param authToken - Photon auth token to authorize GraphQL queries
 * @param pharmacyId - The photon id of the pharmacy
 * @returns An Organization resource representing the pharmacy in your Medplum project.
 */
async function getPharmacy(
  medplum: MedplumClient,
  authToken: string,
  pharmacyId?: string
): Promise<Organization | undefined> {
  if (!pharmacyId) {
    return undefined;
  }

  const idPharmacy = await medplum.searchOne('Organization', {
    identifier: `https://neutron.health|${pharmacyId}`,
  });

  if (idPharmacy) {
    return idPharmacy;
  }

  const query = `
    query pharmacy($id: ID!) {
      pharmacy(id: $id) {
        name
      }
    }
  `;

  const variables = { id: pharmacyId };

  const body = JSON.stringify({ query, variables });
  const result = await photonGraphqlFetch(body, authToken);
  const pharmacyName = result.data.pharmacy.name as string;

  const pharmacy = await medplum.searchOne('Organization', {
    name: pharmacyName,
  });

  return pharmacy;
}

/**
 * Photon may at times send duplicate webhooks. As a part of this bot, the webhook's id is added as an identifier to the
 * linked MedicationRequest. This checks the MedicationRequest to ensure we are not handling a duplicated event.
 *
 * @param webhook - The Photon webhook event
 * @param prescription - An existing MedicationRequest in your project that is linked to this webhook
 * @returns A boolean representing if this is a duplicated event.
 */
function checkForDuplicateEvent(webhook: PhotonWebhook, prescription?: MedicationRequest): boolean {
  if (!prescription) {
    return false;
  }

  const dupe = prescription.identifier?.find((id) => id.value === webhook.body.id);

  if (dupe) {
    return true;
  } else {
    return false;
  }
}

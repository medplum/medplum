import { BotEvent, getCodeBySystem, MedplumClient, normalizeErrorString, PatchOperation } from '@medplum/core';
import { CodeableConcept, MedicationRequest } from '@medplum/fhirtypes';
import { NEUTRON_HEALTH, NEUTRON_HEALTH_PATIENTS, NEUTRON_HEALTH_TREATMENTS } from './constants';
import { formatAWSDate, handlePhotonAuth, photonGraphqlFetch } from './utils';

interface CreatePrescriptionVariables {
  patientId: string;
  treatmentId: string;
  dispenseQuantity: number;
  dispenseUnit: string;
  instructions: string;
  externalId?: string;
  dispenseAsWritten?: boolean;
  refillsAllowed?: number;
  fillsAllowed?: number;
  daysSupply?: number;
  note?: string;
  effectiveDate?: string;
  diagnoses?: string[];
}

export async function handler(medplum: MedplumClient, event: BotEvent<MedicationRequest>): Promise<MedicationRequest> {
  const medicationRequest = event.input;

  // Get the photon auth token to read/write from Photon's API
  const photonClientId = event.secrets['PHOTON_CLIENT_ID']?.valueString;
  const photonClientSecret = event.secrets['PHOTON_CLIENT_SECRET']?.valueString;
  const photonAuthToken = await handlePhotonAuth(photonClientId, photonClientSecret);

  // Get the patient's Photon ID
  const patient = await medplum.readReference(medicationRequest.subject);
  const photonPatientId = patient.identifier?.find((id) => id.system === NEUTRON_HEALTH_PATIENTS)?.value;

  // Get the medication's Photon ID
  const medicationCode = medicationRequest.medicationCodeableConcept;
  const photonTreatmentId = await getPhotonTreatmentId(photonAuthToken, medplum, medicationCode);

  // Get the quantity and unit of the medication being dispensed as part of the prescription
  const dispenseDetails = medicationRequest.dispenseRequest;
  const dispenseQuantity = dispenseDetails?.quantity?.value;
  const dispenseUnit = dispenseDetails?.quantity?.unit;

  // Get the patient's instructions for the prescription
  const instructions = medicationRequest.dosageInstruction?.map((dosage) => dosage.patientInstruction).join('; ');

  // Create the variables object for the mutation and validate that all necessary fields are present
  const variables = createAndValidateVariables(
    photonPatientId,
    photonTreatmentId,
    dispenseQuantity,
    dispenseUnit,
    instructions
  );

  // Get the remaining optional variables
  const dispenseAsWritten = !medicationRequest.substitution?.allowedBoolean;
  const refillsAllowed = dispenseDetails?.numberOfRepeatsAllowed;
  const daysSupply =
    dispenseDetails?.expectedSupplyDuration?.unit === 'days' ? dispenseDetails.expectedSupplyDuration.value : undefined;
  const note = medicationRequest.note?.map((note) => note.text).join('; ');
  const effectiveDate = medicationRequest.authoredOn ? formatAWSDate(medicationRequest.authoredOn) : undefined;

  // Add the optional variables if they are defined
  if (dispenseAsWritten) {
    variables.dispenseAsWritten = dispenseAsWritten;
  }

  if (refillsAllowed) {
    variables.refillsAllowed = refillsAllowed;
  }

  if (daysSupply) {
    variables.daysSupply = daysSupply;
  }

  if (note) {
    variables.note = note;
  }

  if (effectiveDate) {
    variables.effectiveDate = effectiveDate;
  }

  // Create prescription mutation string
  const query = `
    mutation createPrescription(
      $externalId: ID,
      $patientId: ID!,
      $treatmentId: ID!,
      $dispenseAsWritten: Boolean,
      $dispenseQuantity: Float!,
      $dispenseUnit: String!,
      $refillsAllowed: Int,
      $fillsAllowed: Int,
      $daysSupply: Int,
      $instructions: String!,
      $notes: String,
      $effectiveDate: AWSDate,
      $diagnoses: [ID]
    ) {
      createPrescription(
        externalId: $externalId,
        patientId: $patientId,
        treatmentId: $treatmentId,
        dispenseAsWritten: $dispenseAsWritten,
        dispenseQuantity: $dispenseQuantity,
        dispenseUnit: $dispenseUnit,
        refillsAllowed: $refillsAllowed,
        fillsAllowed: $fillsAllowed,
        daysSupply: $daysSupply,
        instructions: $instructions,
        notes: $notes,
        effectiveDate: $effectiveDate,
        diagnoses: $diagnoses
      ) {
        id
        state
        fills {
          id
          state
        }
      }
    }
  `;

  const body = JSON.stringify({ query, variables });
  try {
    // Send the query to Photon's API
    const result = await photonGraphqlFetch(body, photonAuthToken);
    // Parse the prescription's id from the result
    const photonPrescriptionId = result.data?.createPrescription?.id;
    // Add the prescription's Photon ID to the MedicationRequest as an identifier
    if (photonPrescriptionId) {
      const identifier = medicationRequest.identifier ?? [];
      identifier.push({ system: NEUTRON_HEALTH, value: photonPrescriptionId });

      const ops: PatchOperation[] = [
        { op: 'test', path: '/meta/versionId', value: medicationRequest.meta?.versionId },
        { op: 'add', path: '/identifier', value: identifier },
      ];

      // Update the MedicationRequest with the new identifier and return it
      const updatedRequest = await medplum.patchResource('MedicationRequest', medicationRequest.id as string, ops);
      return updatedRequest;
    } else {
      return medicationRequest;
    }
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

/**
 * Takes the medication code from the MedicationRequest and uses this to search for the medication in Photon, returning that
 * medication's Photon ID. Currently, the medication in Photon can only be queried for using the name, so the display value
 * of a CodeableConcept is used for the search term.
 *
 * @param authToken - Photon auth token to access Photon's API
 * @param medicationCode - The Codeable Concept representing the medication being prescribed
 * @returns The Photon ID of the medication being prescribed
 */
export async function getPhotonTreatmentId(
  authToken: string,
  medplum: MedplumClient,
  medicationCode?: CodeableConcept
): Promise<string | undefined> {
  if (!medicationCode) {
    throw new Error('Medication must have a code');
  }

  // If possible get the code from the MedicationKnowledge resource with the given code
  const photonId = await getPhotonIdByCoding(medplum, medicationCode);

  if (photonId) {
    return photonId;
  }

  // Check for an RXNorm code and get the display string
  let medicationName = medicationCode.coding?.find(
    (code) => code.system === 'http://www.nlm.nih.gov/research/umls/rxnorm'
  )?.display;

  // If there is no RXNorm code, check for an NDC code and get the display string
  if (!medicationName) {
    medicationName = medicationCode.coding?.find((code) => code.system === 'http://hl7.org/fhir/sid/ndc')?.display;
  }

  // If there is no RXNorm or NDC throw an error
  if (!medicationName) {
    throw new Error('Could not find medication in Photon');
  }

  // Build the query
  const query = `
    query treatmentOptions($searchTerm: String!) {
      treatmentOptions(searchTerm: $searchTerm) {
        medicationId
        name
        ndc
      }
    }
  `;

  const variables = { searchTerm: medicationName };

  const body = JSON.stringify({ query, variables });

  try {
    // Query Photon's clinical API
    const response = await fetch('https://clinical-api.neutron.health/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-photon-auth-token-type': 'auth0',
        'x-photon-auth-token': authToken,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    // Return the medication ID
    return result.data.treatmentOptions?.[0].medicationId;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

/**
 * Searches for Medication Knowledge resources with the given code, then checks if the Photon ID for that treatment is stored on
 * them. If it is, it returns the Photon Treatment ID.
 *
 * @param medplum - Medplum Client to search for MedicationKnowledge resources
 * @param medicationCode - The codeable concept of the medication for the prescription
 * @returns - The Photon ID if it is store on the MedicationKnowledge
 */
export async function getPhotonIdByCoding(
  medplum: MedplumClient,
  medicationCode: CodeableConcept
): Promise<string | undefined> {
  // Get the medication's code by RXNorm or NDC
  let code =
    getCodeBySystem(medicationCode, 'http://www.nlm.nih.gov/research/umls/rxnorm') ??
    getCodeBySystem(medicationCode, 'http://hl7.org/fhir/sid/ndc');

  // If there is a code, search for the relevant MedicationKnowledge in your project
  if (code) {
    const medicationKnowledge = await medplum.searchOne('MedicationKnowledge', {
      code,
    });

    // Check for the Photon Treatment ID on your MedicationKnowledge, and return it if it exists
    if (medicationKnowledge?.code) {
      const photonId = getCodeBySystem(medicationKnowledge.code, NEUTRON_HEALTH_TREATMENTS);
      return photonId;
    }
  }
}

/**
 * Takes the fields that are required variables in Photon's createPrescription mutation, verifies that they exist, and returns
 * them as an object that can be used in the mutation.
 *
 * @param photonPatientId - The patient's ID in Photon
 * @param photonTreatmentId - The treatment's ID in Photon
 * @param dispenseQuantity - The quantity of medication being dispensed
 * @param dispenseUnit - The unit of the amount being dispensed
 * @param instructions - The instructions for the patient on how to take the prescription
 * @returns A validated object containing the required variables for Photon's createPrescription mutation
 */
export function createAndValidateVariables(
  photonPatientId?: string,
  photonTreatmentId?: string,
  dispenseQuantity?: number,
  dispenseUnit?: string,
  instructions?: string
): CreatePrescriptionVariables {
  const variables = {
    patientId: photonPatientId,
    treatmentId: photonTreatmentId,
    dispenseQuantity,
    dispenseUnit,
    instructions,
  };

  const missingFields = Object.entries(variables)
    .filter(([_key, value]) => value === undefined)
    .map(([key]) => key);

  if (missingFields.length > 0) {
    throw new Error(`The following required fields are missing: ${missingFields.join(', ')}`);
  }

  return variables as CreatePrescriptionVariables;
}

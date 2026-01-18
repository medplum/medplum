import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import {
  makeConditionalFhirRequest,
  makeExternalRequest,
  HTTP_VERBS,
  logExternalRequest,
} from '../shared/http-helpers';

/**
 * HAPI FHIR Server Sync Bot (Simple Version)
 *
 * This Medplum bot synchronizes patient data to an external HAPI FHIR server.
 * It handles both creation/updates and deletions of patient records.
 *
 * The bot does not modify the input resource - it only sends data to the external server
 * and returns a boolean indicating success/failure.
 *
 * @author Medplum Team
 * @version 1.0.0
 */

/** Base URL for the HAPI FHIR server */
const HAPI_SERVER = 'https://hapi.fhir.org/baseR4';

/**
 * Synchronizes a patient resource to the HAPI FHIR server
 *
 * This function takes a patient resource and sends it to the HAPI server using
 * the specified HTTP method. It adds a Medplum identifier to the patient for
 * tracking purposes.
 *
 * @param patient - The FHIR Patient resource to sync
 * @param verb - The HTTP method to use (PUT for create/update, DELETE for deletion)
 * @returns Promise that resolves to true if successful
 * @throws OperationOutcomeError if the sync fails
 */
async function syncHapiResource(patient: Patient, verb: HTTP_VERBS): Promise<boolean> {
  try {
    // Add Medplum identifier to the patient for tracking
    const patientForHapi = {
      ...patient,
      identifier: [
        ...(patient.identifier || []),
        {
          system: 'https://medplum.com/patient-id',
          value: patient.id || 'unknown',
        },
      ],
    };

    // Send patient record to HAPI FHIR server
    if (patient.id) {
      // Use conditional operation for existing patients
      await makeConditionalFhirRequest(
        HAPI_SERVER,
        'Patient',
        `https://medplum.com/patient-id|${patient.id}`,
        verb,
        patientForHapi
      );
    } else {
      // For new patients without ID, use POST to create
      await makeExternalRequest(`${HAPI_SERVER}/Patient`, HTTP_VERBS.POST, patientForHapi);
    }

    logExternalRequest(`HAPI sync ${verb}`, patient.id || 'unknown', true);

    return true;
  } catch (error) {
    logExternalRequest(
      `HAPI sync ${verb}`,
      patient.id || 'unknown',
      false,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

/**
 * Main bot handler function
 *
 * This is the entry point for the Medplum bot. It processes patient events
 * and syncs them to the HAPI FHIR server. The bot handles both regular
 * patient updates and deletions.
 *
 * Key behaviors:
 * - Logs patient name for debugging
 * - Checks for deletion header to determine operation type
 * - Syncs patient data to HAPI server without modifying input
 * - Propagates any errors as OperationOutcomeError
 *
 * @param _medplum - The Medplum client (unused in this implementation)
 * @param event - The bot event containing patient data and headers
 * @returns Promise that resolves when sync is complete
 * @throws OperationOutcomeError if sync fails
 */
export async function handler(_medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;
  const firstName = patient.name?.[0]?.given?.[0];
  const lastName = patient.name?.[0]?.family;
  console.log(`Hello ${firstName} ${lastName}!`);

  // Check if this is a deletion event
  if (event.headers?.['X-Medplum-Deleted-Resource']) {
    await syncHapiResource(patient, HTTP_VERBS['DELETE']);
  } else {
    // Create or update a copy of the patient record
    await syncHapiResource(patient, HTTP_VERBS['PUT']);
  }

  return patient;
}

// CommonJS export for Medplum bots

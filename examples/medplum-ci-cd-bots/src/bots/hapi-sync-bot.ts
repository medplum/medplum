import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient, Identifier } from '@medplum/fhirtypes';
import { makeConditionalFhirRequest, makeExternalRequest, HTTP_VERBS, logExternalRequest } from '../shared/http-helpers';

/**
 * HAPI FHIR Server Sync Bot with External EHR Integration
 *
 * This Medplum bot synchronizes patient data to an external HAPI FHIR server
 * while handling special cases for External EHR integration. It manages both
 * creation/updates and deletions of patient records, and enriches the patient
 * data with HAPI server identifiers.
 *
 * Key features:
 * - Skips processing for External EHR authored resources
 * - Adds bidirectional identifiers for tracking
 * - Returns updated patient with HAPI server ID
 * - Handles deletions appropriately
 *
 * @author Medplum Team
 * @version 2.0.0
 */

/** Base URL for the HAPI FHIR server */
const HAPI_SERVER = 'https://hapi.fhir.org/baseR4';

/**
 * Synchronizes a patient resource to the HAPI FHIR server
 *
 * This function sends a patient resource to the HAPI server and enriches
 * the patient data with the server's response. For PUT operations, it adds
 * the HAPI server's patient ID as an identifier to enable bidirectional
 * tracking between Medplum and HAPI.
 *
 * @param patient - The FHIR Patient resource to sync
 * @param verb - The HTTP method to use (PUT for create/update, DELETE for deletion)
 * @returns Promise that resolves to the updated Patient resource
 * @throws OperationOutcomeError if the sync fails
 */
async function syncHapiResource(patient: Patient, verb: HTTP_VERBS): Promise<Patient> {
  try {
    // Add Medplum identifier to the patient for tracking on HAPI server
    const patientForHapi = {
      ...patient,
      identifier: [
        ...(patient.identifier || []),
        {
          system: 'https://medplum.com/patient-id',
          value: patient.id || 'unknown',
        } as Identifier,
      ],
    };

    // Send patient record to HAPI FHIR server
    let responseData;
    if (patient.id) {
      // Use conditional operation for existing patients
      responseData = await makeConditionalFhirRequest(
        HAPI_SERVER,
        'Patient',
        `https://medplum.com/patient-id|${patient.id}`,
        verb,
        patientForHapi
      );
    } else {
      // For new patients without ID, use POST to create
      responseData = await makeExternalRequest(
        `${HAPI_SERVER}/Patient`,
        HTTP_VERBS.POST,
        patientForHapi
      );
    }

    const hapiPatientId = responseData.id;

    // For PUT/POST operations, enrich the patient with HAPI server ID
    if (hapiPatientId && (verb === HTTP_VERBS['PUT'] || verb === HTTP_VERBS['POST'])) {
      const updatedIdentifiers = [...(patient.identifier || [])];

      // Check if HAPI identifier already exists to avoid duplicates
      const existingHapiIdentifier = updatedIdentifiers.find(
        (id) => id.system === 'https://hapi-server.com/patient-id'
      );

      if (!existingHapiIdentifier) {
        // Add new HAPI identifier
        updatedIdentifiers.push({
          system: 'https://hapi-server.com/patient-id',
          value: hapiPatientId,
        } as Identifier);
      } else {
        // Update existing identifier value
        existingHapiIdentifier.value = hapiPatientId;
      }

      // Return updated patient object with HAPI server ID
      return {
        ...patient,
        identifier: updatedIdentifiers,
      };
    }

    // For DELETE operations or when no HAPI ID is returned, return original patient
    return patient;
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
 * and syncs them to the HAPI FHIR server with special handling for External EHR
 * integration. The bot returns the updated patient resource with HAPI server
 * identifiers added.
 *
 * Key behaviors:
 * - Skips processing for External EHR authored resources
 * - Removes meta information from all processed resources
 * - Handles both regular updates and deletions
 * - Returns enriched patient data with HAPI server identifiers
 *
 * External EHR Integration:
 * - Uses EXTERNAL_EHR_APP secret to identify External EHR authored resources
 * - Skips HAPI sync for resources authored by External EHR
 * - Still cleans meta data and returns the patient for External EHR resources
 *
 * @param _medplum - The Medplum client (unused in this implementation)
 * @param event - The bot event containing patient data, headers, and secrets
 * @returns Promise that resolves to the updated Patient resource
 * @throws OperationOutcomeError if sync fails
 */
export async function handler(_medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;

  // Get External EHR client application reference from secrets
  const externalEHRClientApplication = event.secrets['EXTERNAL_EHR_APP']?.valueString;

  // Skip HAPI sync for External EHR authored resources
  if (externalEHRClientApplication && patient.meta?.author?.reference === externalEHRClientApplication) {
    console.log('External EHR resource, skipping HAPI sync');
    delete patient.meta;
    return patient;
  }

  // Clean meta information from all processed resources
  delete patient.meta;

  // Handle deletion vs creation/update based on headers
  if (event.headers?.['X-Medplum-Deleted-Resource']) {
    await syncHapiResource(patient, HTTP_VERBS['DELETE']);
    return patient;
  } else {
    // Create or update patient record and return enriched data
    return syncHapiResource(patient, HTTP_VERBS['PUT']);
  }
}

// CommonJS export for Medplum bots

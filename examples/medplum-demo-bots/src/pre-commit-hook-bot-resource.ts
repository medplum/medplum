import { BotEvent, MedplumClient, OperationOutcomeError } from '@medplum/core';
import { Patient, OperationOutcome, Identifier } from '@medplum/fhirtypes';

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
 * @author Your Name
 * @version 2.0.0
 */

/** Base URL for the HAPI FHIR server */
const HAPI_SERVER = 'http://hapi-server:8080';

/** HTTP methods used for HAPI FHIR operations */
enum HTTP_VERBS {
  'PUT', // Create or update patient
  'DELETE', // Delete patient
}

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

    // Send patient record to HAPI FHIR server using conditional operation
    const response = await fetch(
      `${HAPI_SERVER}/fhir/Patient?identifier=https://medplum.com/patient-id|${patient.id}`,
      {
        method: HTTP_VERBS[verb],
        headers: {
          accept: 'application/fhir+json',
          'Content-Type': 'application/fhir+json',
        },
        body: JSON.stringify(patientForHapi),
      }
    );

    if (!response.ok) {
      // If the request failed, parse the response body for error details
      let errorBody;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }

      // Create an OperationOutcome with the HTTP error details
      const operationOutcome: OperationOutcome = {
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'processing',
            diagnostics: `HAPI FHIR request failed: ${response.status} ${response.statusText}`,
            details: {
              text: typeof errorBody === 'string' ? errorBody : JSON.stringify(errorBody),
            },
          },
        ],
      };
      throw new OperationOutcomeError(operationOutcome);
    }

    // Parse the response to get the HAPI server's patient ID
    const responseData = await response.json();
    const hapiPatientId = responseData.id;

    // For PUT operations, enrich the patient with HAPI server ID
    if (hapiPatientId && verb === HTTP_VERBS['PUT']) {
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
    // If it's already an OperationOutcomeError, re-throw it
    if (error instanceof OperationOutcomeError) {
      throw error;
    }

    // For other errors (network issues, etc.), create a new OperationOutcome
    const operationOutcome: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'exception',
          diagnostics: `Network or processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: {
            text: error instanceof Error ? error.stack || error.message : String(error),
          },
        },
      ],
    };
    throw new OperationOutcomeError(operationOutcome);
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
  const externalEHRClientApplication = event.secrets['EXTERNAL_EHR_APP'].valueString;

  // Skip HAPI sync for External EHR authored resources
  if (patient.meta?.author?.reference === externalEHRClientApplication) {
    console.log('external ehr, skipping');
    delete patient.meta;
    return patient;
  }

  // Clean meta information from all processed resources
  delete patient.meta;

  // Handle deletion vs creation/update based on headers
  if (event.headers?.['X-Medplum-Deleted-Resource']) {
    return syncHapiResource(patient, HTTP_VERBS['DELETE']);
  } else {
    // Create or update patient record and return enriched data
    return syncHapiResource(patient, HTTP_VERBS['PUT']);
  }
}

/**
 * Configuration Notes:
 *
 * 1. Secrets Configuration:
 *    - EXTERNAL_EHR_APP: Reference to the External EHR client application
 *    - Used to identify resources that should skip HAPI synchronization
 *    - Should be configured in Medplum bot settings
 *
 * 2. Identifier Strategy:
 *    - Medplum ID: Added to resources sent to HAPI (https://medplum.com/patient-id)
 *    - HAPI ID: Added to resources returned from HAPI (https://hapi-server.com/patient-id)
 *    - Enables bidirectional tracking between systems
 *
 * 3. External EHR Integration:
 *    - Resources authored by External EHR skip HAPI synchronization
 *    - Prevents circular updates and conflicts
 *    - Meta data is still cleaned for consistency
 *
 * 4. Return Value Changes:
 *    - Bot now returns the updated patient resource
 *    - Includes HAPI server ID for successful PUT operations
 *    - Allows downstream processes to access HAPI identifiers
 *
 * 5. Error Handling:
 *    - All errors converted to OperationOutcomeError
 *    - Detailed error information preserved
 *    - Network and HTTP errors handled gracefully
 *
 * 6. Meta Data Handling:
 *    - Meta information is removed from all processed resources
 *    - Ensures clean data flow between systems
 *    - Prevents meta pollution in downstream systems
 *
 * 7. Limitations:
 *    - Only handles Patient resources
 *    - No retry logic for failed HAPI requests
 *    - Assumes HAPI server supports conditional operations
 *    - No validation of HAPI server response format
 */

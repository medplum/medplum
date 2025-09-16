// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BotEvent, MedplumClient, OperationOutcomeError } from '@medplum/core';
import { Patient, OperationOutcome, Identifier } from '@medplum/fhirtypes';

/**
 * HAPI FHIR Server Sync Bot
 *
 * This Medplum bot synchronizes patient data to an external HAPI FHIR server.
 * It handles both creation/updates and deletions of patient records.
 *
 * The bot does not modify the input resource - it only sends data to the external server.
 *
 * @author Your Name
 * @version 1.0.0
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
        } as Identifier,
      ],
    };

    // Send patient record to HAPI FHIR server
    // Uses conditional update/delete based on the Medplum identifier
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

    // Log successful response
    const responseData = await response.json();
    console.log('Successfully updated patient to HAPI FHIR server:', responseData.id);
    return true;
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
 * {
 *   input: Patient,
 *   headers: {
 *     'X-Medplum-Deleted-Resource'?: string // Present for deletions
 *   }
 * }
 * ```
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
}

/**
 * Configuration Notes:
 *
 * 1. HAPI Server Setup:
 *    - Ensure HAPI_SERVER URL is accessible from your Medplum environment
 *    - Verify the server accepts conditional updates via query parameters
 *    - Check that the server supports the identifier system used
 *
 * 2. Error Handling:
 *    - All errors are converted to OperationOutcomeError for consistent handling
 *    - Network errors, HTTP errors, and parsing errors are all caught
 *    - Error details are preserved in the OperationOutcome for debugging
 *
 * 3. Identifier Strategy:
 *    - Adds a Medplum-specific identifier to track resources
 *    - Uses conditional operations based on this identifier
 *    - Preserves existing identifiers on the patient
 *
 * 4. Bot Triggers:
 *    - Should be configured to trigger on Patient resource changes
 *    - Handles both create/update and delete operations
 *    - Uses the X-Medplum-Deleted-Resource header to detect deletions
 *
 * 5. Limitations:
 *    - Only handles Patient resources
 *    - Assumes HAPI server is always available
 *    - No retry logic for failed requests
 *    - No bulk operations support
 */

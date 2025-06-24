import { BotEvent, MedplumClient, OperationOutcomeError } from '@medplum/core';
import { Patient, OperationOutcome, Identifier } from '@medplum/fhirtypes';

const HAPI_SERVER = 'http://hapi-server:8080';
enum HTTP_VERBS {
  'PUT',
  'DELETE',
}

async function syncHapiResource(patient: Patient, verb: HTTP_VERBS): Promise<Patient> {
  try {
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

    // Update the patient object with the HAPI server ID as an identifier
    if (hapiPatientId && verb === HTTP_VERBS['PUT']) {
      const updatedIdentifiers = [...(patient.identifier || [])];

      // Check if HAPI identifier already exists to avoid duplicates
      const existingHapiIdentifier = updatedIdentifiers.find(
        (id) => id.system === 'https://hapi-server.com/patient-id'
      );

      if (!existingHapiIdentifier) {
        updatedIdentifiers.push({
          system: 'https://hapi-server.com/patient-id',
          value: hapiPatientId,
        } as Identifier);
      } else {
        // Update existing identifier value
        existingHapiIdentifier.value = hapiPatientId;
      }

      // Return updated patient object
      return {
        ...patient,
        identifier: updatedIdentifiers,
      };
    }

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

export async function handler(_medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;

  if (event.headers?.['X-Medplum-Deleted-Resource']) {
    return await syncHapiResource(patient, HTTP_VERBS['DELETE']);
  } else {
    // Create or update a copy of the patient record
    return await syncHapiResource(patient, HTTP_VERBS['PUT']);
  }
}

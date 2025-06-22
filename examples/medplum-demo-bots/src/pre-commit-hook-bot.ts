import { BotEvent, MedplumClient, OperationOutcomeError } from '@medplum/core';
import { Patient, OperationOutcome, Identifier } from '@medplum/fhirtypes';

const HAPI_SERVER = 'http://hapi-server:8080';
enum HTTP_VERBS {
  'PUT',
  'DELETE',
}

async function syncHapiResource(patient: Patient, verb: HTTP_VERBS): Promise<boolean> {
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

export async function handler(_medplum: MedplumClient, event: BotEvent): Promise<any> {
  console.log('Bot Event Details:');
  console.log('Bot Reference:', JSON.stringify(event.bot, null, 2));
  console.log('Content Type:', event.contentType);
  console.log('Input:', JSON.stringify(event.input, null, 2));
  console.log('Secrets:', event.secrets ? 'Secrets present' : 'No secrets');
  console.log('Trace ID:', event.traceId || 'No trace ID');
  console.log('Headers:', event.headers ? JSON.stringify(event.headers, null, 2) : 'No headers');

  const patient = event.input as Patient;
  const firstName = patient.name?.[0]?.given?.[0];
  const lastName = patient.name?.[0]?.family;
  console.log(`Hello ${firstName} ${lastName}!`);

  if (event.headers?.['X-Medplum-Deleted-Resource']) {
    await syncHapiResource(patient, HTTP_VERBS['DELETE']);
  } else {
    // Create or update a copy of the patient record
    await syncHapiResource(patient, HTTP_VERBS['PUT']);
  }
}

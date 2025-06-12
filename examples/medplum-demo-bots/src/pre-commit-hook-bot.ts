import { BotEvent, MedplumClient, OperationOutcomeError } from '@medplum/core';
import { Patient, OperationOutcome, Identifier } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;
  const firstName = patient.name?.[0]?.given?.[0];
  const lastName = patient.name?.[0]?.family;
  console.log(`Hello ${firstName} ${lastName}!`);

  try {
    // Create a copy of the patient record and add Medplum identifier
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
    const response = await fetch('http://hapi-server:8080/fhir/Patient', {
      method: 'POST',
      headers: {
        accept: 'application/fhir+json',
        'Content-Type': 'application/fhir+json',
      },
      body: JSON.stringify(patientForHapi),
    });

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
    console.log('Successfully sent patient to HAPI FHIR server:', responseData.id);

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

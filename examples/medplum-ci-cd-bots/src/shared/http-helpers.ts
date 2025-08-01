import { OperationOutcomeError } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';

/**
 * Shared HTTP Helpers for Medplum Bots
 * 
 * This module provides reusable HTTP functionality for bots that need to
 * communicate with external services. It includes standardized error handling
 * and response processing.
 * 
 * @author Medplum Team
 * @version 1.0.0
 */

/** HTTP methods used for external API operations */
export enum HTTP_VERBS {
  'PUT', // Create or update resource
  'DELETE', // Delete resource
}

/**
 * Makes an HTTP request to an external service with standardized error handling
 * 
 * @param url - The URL to make the request to
 * @param method - The HTTP method to use
 * @param body - The request body (optional)
 * @param headers - Additional headers to include
 * @returns Promise that resolves to the response data
 * @throws OperationOutcomeError if the request fails
 */
export async function makeExternalRequest(
  url: string,
  method: HTTP_VERBS,
  body?: any,
  headers: Record<string, string> = {}
): Promise<any> {
  try {
    const response = await fetch(url, {
      method: HTTP_VERBS[method],
      headers: {
        accept: 'application/fhir+json',
        'Content-Type': 'application/fhir+json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : null,
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
            diagnostics: `External request failed: ${response.status} ${response.statusText}`,
            details: {
              text: typeof errorBody === 'string' ? errorBody : JSON.stringify(errorBody),
            },
          },
        ],
      };

      throw new OperationOutcomeError(operationOutcome);
    }

    // Parse and return the response data
    const responseData = await response.json();
    const responseId = (responseData as any)?.id || 'no id';
    console.log(`Successfully completed ${method} request to ${url}:`, responseId);
    return responseData;
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
 * Makes a conditional request to an external FHIR server
 * 
 * This function is specifically designed for FHIR servers that support
 * conditional operations based on identifiers.
 * 
 * @param baseUrl - The base URL of the external FHIR server
 * @param resourceType - The FHIR resource type (e.g., 'Patient')
 * @param identifier - The identifier to use for conditional operations
 * @param method - The HTTP method to use
 * @param body - The request body (optional)
 * @returns Promise that resolves to the response data
 * @throws OperationOutcomeError if the request fails
 */
export async function makeConditionalFhirRequest(
  baseUrl: string,
  resourceType: string,
  identifier: string,
  method: HTTP_VERBS,
  body?: any
): Promise<any> {
  const url = `${baseUrl}/fhir/${resourceType}?identifier=${identifier}`;
  return makeExternalRequest(url, method, body);
}

/**
 * Logs the result of an external request for debugging and audit purposes
 * 
 * @param operation - Description of the operation performed
 * @param resourceId - The ID of the resource being processed
 * @param success - Whether the operation was successful
 * @param error - Error details if the operation failed
 */
export function logExternalRequest(
  operation: string,
  resourceId: string,
  success: boolean,
  error?: string
): void {
  const timestamp = new Date().toISOString();
  const status = success ? 'SUCCESS' : 'FAILED';
  
  console.log(`[${timestamp}] ${operation} - Resource: ${resourceId} - Status: ${status}`);
  
  if (error) {
    console.error(`[${timestamp}] ${operation} - Error: ${error}`);
  }
} 
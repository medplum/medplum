import { BotEvent, MedplumClient } from '@medplum/core';
import { Bundle, DocumentReference, Identifier } from '@medplum/fhirtypes';

/**
 * This bot is used to handle the consolidated data webhook from Metriport.
 * It will process the bundle using Medplum's batch capability.
 *
 * Docs:
 * - https://www.medplum.com/docs/bots/consuming-webhooks
 * - https://docs.metriport.com/medical-api/getting-started/webhooks
 *
 * @param medplum - The Medplum client
 * @param event - The event object
 * @returns A promise that resolves to the response
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Record<string, any>>): Promise<any> {
  const metriportApiKey = event.secrets['METRIPORT_API_KEY']?.valueString;
  if (!metriportApiKey) {
    throw new Error('Missing METRIPORT_API_KEY');
  }

  const metriportWebhookKey = event.secrets['METRIPORT_WEBHOOK_KEY']?.valueString;
  if (!metriportWebhookKey) {
    throw new Error('Missing METRIPORT_WEBHOOK_KEY');
  }

  const input = event.input;
  const messageType = input.meta?.type;
  if (!messageType) {
    throw new Error('Missing message type');
  }

  // Handle different webhook message types
  // See https://docs.metriport.com/medical-api/handling-data/webhooks#types-of-messages
  switch (messageType) {
    case 'ping':
      console.log('Received ping');
      return { pong: input.ping };

    case 'medical.consolidated-data':
      if (input.patients[0]?.bundle?.entry) {
        const docRef = input.patients[0].bundle.entry[0]?.resource as DocumentReference;
        if (!docRef?.content?.[0]?.attachment?.url) {
          throw new Error('Missing document URL');
        }

        try {
          console.log('Processing consolidated data for patient:', input.patients[0].patientId);
          // Fetch the actual data from the URL
          const response = await fetch(docRef.content[0].attachment.url);
          // This is a searchset bundle
          const consolidatedData = (await response.json()) as Bundle;

          const transactionBundle = convertToTransactionBundle(consolidatedData);
          const responseBundle = await medplum.executeBatch(transactionBundle);

          // Log only error responses
          const errors = responseBundle.entry
            ?.filter((entry) => {
              const outcome = entry.response?.outcome;
              return (
                outcome?.resourceType === 'OperationOutcome' &&
                outcome.issue?.some((issue) => issue.severity === 'error')
              );
            })
            .map((entry) => ({
              resource: entry.resource?.resourceType,
              error: entry.response?.outcome?.issue?.[0]?.details?.text,
              expression: entry.response?.outcome?.issue?.[0]?.expression,
            }));

          if (errors && errors.length > 0) {
            console.error('Errors in bundle:', JSON.stringify(errors, null, 2));
          }
          return true;
        } catch (error) {
          console.error('Error processing consolidated data:', error);
          throw error;
        }
      }
      break;

    default:
      throw new Error(`Not implemented webhook message type: ${messageType}`);
  }

  return true;
}

const METRIPORT_IDENTIFIER_SYSTEM = 'https://metriport.com/fhir/identifiers';

export function convertToTransactionBundle(bundle: Bundle): Bundle {
  // Build the ID to fullUrl mapping
  const idToFullUrlMap: Record<string, string> = {};
  bundle.entry?.forEach((entry) => {
    if (entry.resource?.id && entry.fullUrl) {
      idToFullUrlMap[entry.resource.id] = entry.fullUrl;
    }
  });

  const transactionBundle: Bundle = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry:
      bundle.entry?.map((entry) => {
        const resource = entry.resource;
        if (!resource) {
          return entry;
        }

        const originalId = resource.id;

        // Create a deep clone and process the resource
        const processedResource = JSON.parse(
          JSON.stringify(resource, (key, value) => referenceReplacer(key, value, idToFullUrlMap))
        );

        // The id needs to be removed for the Upsert operation
        delete processedResource.id;

        // Add Metriport identifier
        const metriportIdentifier = { system: METRIPORT_IDENTIFIER_SYSTEM, value: originalId };
        processedResource.identifier = processedResource.identifier
          ? [
              ...processedResource.identifier.filter(
                (id: Identifier) => !(id.system === METRIPORT_IDENTIFIER_SYSTEM && id.value === originalId)
              ),
              metriportIdentifier,
            ]
          : [metriportIdentifier];

        // Handle DocumentReference dates
        if (processedResource.resourceType === 'DocumentReference' && processedResource.date) {
          try {
            processedResource.date = new Date(processedResource.date).toISOString();
          } catch {
            delete processedResource.date;
          }
        }

        return {
          fullUrl: entry.fullUrl,
          resource: processedResource,
          request: {
            method: 'PUT',
            url: `${resource.resourceType}?identifier=${originalId}`,
          },
        };
      }) || [],
  };

  return transactionBundle;
}

function referenceReplacer(key: string, value: string, idToFullUrl: Record<string, string>): string {
  if (key === 'reference' && typeof value === 'string') {
    let id;
    if (value.includes('/')) {
      id = value.split('/')[1];
    } else if (value.startsWith('urn:uuid:')) {
      id = value.slice(9);
    } else if (value.startsWith('#')) {
      id = value.slice(1);
    }
    if (id) {
      const fullUrl = idToFullUrl[id];
      if (fullUrl) {
        return fullUrl;
      }
    }
    return value;
  }
  return value;
}

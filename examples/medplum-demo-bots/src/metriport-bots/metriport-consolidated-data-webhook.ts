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
          const consolidatedData = (await response.json()) as Bundle; // This is a searchset bundle

          // Create a map of resource IDs to their fullUrls
          const idToFullUrlMap = new Map<string, string>();
          consolidatedData.entry?.forEach((entry) => {
            if (entry.resource?.id && entry.fullUrl) {
              idToFullUrlMap.set(entry.resource.id, entry.fullUrl);
            }
          });

          // Transform the bundle into a transaction bundle
          const transactionBundle: Bundle = {
            resourceType: 'Bundle',
            type: 'transaction',
            entry:
              consolidatedData.entry?.map((entry) => {
                // Process references and add Metriport identifier
                const processedResource = prepareResourceForUpsert(entry.resource, idToFullUrlMap);
                const originalId = processedResource?.id;

                if (processedResource) {
                  delete processedResource.id;
                }

                return {
                  fullUrl: entry.fullUrl,
                  resource: processedResource,
                  request: {
                    method: 'PUT',
                    url: `${processedResource?.resourceType}?identifier=${originalId}`,
                  },
                };
              }) || [],
          };

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

function prepareResourceForUpsert(resource: any, idToFullUrlMap: Map<string, string>): any {
  if (!resource) {
    return resource;
  }

  // Deep clone the resource to avoid modifying the original
  const clonedResource = JSON.parse(JSON.stringify(resource));

  // Handle DocumentReference date formatting
  if (clonedResource.resourceType === 'DocumentReference' && clonedResource.date) {
    try {
      // Ensure the date is in proper ISO format with timezone
      const date = new Date(clonedResource.date);
      clonedResource.date = date.toISOString();
    } catch (_error) {
      console.warn('Invalid date format in DocumentReference:', clonedResource.date);
      delete clonedResource.date;
    }
  }

  if (!clonedResource.id) {
    return clonedResource;
  }

  const metriportIdentifier = {
    system: METRIPORT_IDENTIFIER_SYSTEM,
    value: clonedResource.id,
  };

  if (!clonedResource.identifier) {
    clonedResource.identifier = [metriportIdentifier];
  } else if (Array.isArray(clonedResource.identifier)) {
    // Check if identifier already exists
    const exists = clonedResource.identifier.some(
      (id: Identifier) => id.system === METRIPORT_IDENTIFIER_SYSTEM && id.value === clonedResource.id
    );
    if (!exists) {
      clonedResource.identifier.push(metriportIdentifier);
    }
  }

  // Recursively process all properties
  Object.entries(clonedResource).forEach(([key, value]) => {
    if (typeof value === 'object' && value !== null) {
      if ('reference' in value && typeof value.reference === 'string') {
        // This is a reference - replace it if we have a mapping
        const [_resourceType, id] = value.reference.split('/');
        if (id && idToFullUrlMap.has(id)) {
          value.reference = idToFullUrlMap.get(id);
        }
      } else {
        // Recursively process nested objects and arrays
        clonedResource[key] = prepareResourceForUpsert(value, idToFullUrlMap);
      }
    }
  });

  return clonedResource;
}

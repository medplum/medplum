import { BotEvent, MedplumClient, reorderBundle } from '@medplum/core';
import { Bundle, DocumentReference, ResourceType } from '@medplum/fhirtypes';

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
  const metriportWebhookKey = event.secrets['METRIPORT_WEBHOOK_KEY']?.valueString;
  if (!metriportWebhookKey) {
    throw new Error('Missing METRIPORT_WEBHOOK_KEY');
  }

  const metriportApiKey = event.secrets['METRIPORT_API_KEY']?.valueString;
  if (!metriportApiKey) {
    throw new Error('Missing METRIPORT_API_KEY');
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

          // Process the consolidated data using Medplum's batch capability
          const transactionBundle = convertToTransactionBundle(consolidatedData);
          const responseBundle = await medplum.executeBatch(transactionBundle);

          console.log('Response bundle:', JSON.stringify(responseBundle, null, 2));
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

function convertToTransactionBundle(bundle: Bundle): Bundle {
  const transactionBundle: Bundle = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry:
      bundle.entry?.map((entry) => ({
        ...entry,
        request: {
          method: 'PUT',
          url: getUpsertUrl(entry.resource),
        },
      })) || [],
  };

  // Map to track contained resource IDs/identifiers -> UUIDs
  // const resourceMap = new Map<string, string>();

  return reorderBundle(transactionBundle);
}

function getUpsertUrl(resource: any): string {
  const resourceType = resource.resourceType as ResourceType;

  // Fallback to the resource name if no identifier is found
  if (resource.name) {
    return `${resourceType}?name=${resource.name}`;
  }

  throw new Error(`No upsert URL found for ${resourceType}`);
}

import { BotEvent, ContentType, MedplumClient } from '@medplum/core';
import { Bundle, DocumentReference, Identifier } from '@medplum/fhirtypes';

/**
 * This bot is used to handle the consolidated data webhook from Metriport.
 * It will process the bundle using Medplum's batch capability.
 *
 * References:
 * - Medplum Consuming Webhook: https://www.medplum.com/docs/bots/consuming-webhooks
 * - Metriport Implementing Webhooks: https://docs.metriport.com/medical-api/getting-started/webhooks
 * - Metriport Receiving Webhooks: https://docs.metriport.com/medical-api/handling-data/webhooks
 * - Metriport Message Types: https://docs.metriport.com/medical-api/handling-data/webhooks#types-of-messages
 *
 * @param medplum - The Medplum client
 * @param event - The BotEvent object containing the Metriport Webhook Message
 *
 * @returns A promise that resolves depending on the webhook message type
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
      return { pong: input.ping };

    case 'medical.consolidated-data':
      {
        const medplumPatientId = input.meta?.data?.medplumPatientId;
        if (!medplumPatientId) {
          throw new Error(
            'Missing medplumPatientId. The startConsolidatedQuery call must include the medplumPatientId metadata.'
          );
        }

        if (input.patients[0]?.bundle?.entry) {
          const docRef = input.patients[0].bundle.entry[0]?.resource as DocumentReference;
          if (!docRef?.content?.[0]?.attachment?.url) {
            throw new Error('Missing document URL');
          }

          try {
            const metriportPatientId = input.patients[0].patientId;
            console.log('Processing consolidated data for patient:', metriportPatientId);
            // Fetch the actual data from the URL
            const response = await fetch(docRef.content[0].attachment.url);
            // This is a searchset bundle
            const consolidatedData = (await response.json()) as Bundle;

            // NOTE: We are not filtering out any Resources from the consolidated data bundle.
            // This means that we will process all resources in the bundle, so the AccessPolicy needs
            // to be set to allow all resources to be processed. If you are using this bot in a production
            // environment, you should filter out the resources that you do not want to process.
            // See: https://www.medplum.com/docs/bots/consuming-webhooks#creating-access-policies
            const transactionBundle = convertToTransactionBundle(consolidatedData, medplumPatientId);
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
              throw new Error(`Error executing the transaction bundle: ${JSON.stringify(errors, null, 2)}`);
            }
            return true;
          } catch (error) {
            throw new Error(`Error processing consolidated data: ${error}`, { cause: error });
          }
        }
      }
      break;

    default:
      throw new Error(`Not implemented webhook message type: ${messageType}`);
  }

  return true;
}

/**
 * Converts a searchset bundle to a transaction bundle.
 *
 * @param bundle - The searchset bundle
 * @param medplumPatientId - The Medplum patient ID
 * @param metriportPatientId - The Metriport patient ID
 *
 * @returns The transaction bundle
 */

export function convertToTransactionBundle(bundle: Bundle, medplumPatientId: string): Bundle {
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

        const resourceType = processedResource.resourceType;
        const metriportIdentifierSystem = `https://metriport.com/fhir/identifiers/${resourceType.toLowerCase()}-id`;

        // Add Metriport identifier
        const metriportIdentifier = {
          system: metriportIdentifierSystem,
          value: originalId,
        };
        processedResource.identifier = processedResource.identifier
          ? [
              ...processedResource.identifier.filter(
                (id: Identifier) =>
                  !(id.system === metriportIdentifier.system && id.value === metriportIdentifier.value)
              ),
              metriportIdentifier,
            ]
          : [metriportIdentifier];

        // Handle DocumentReference dates
        if (resourceType === 'DocumentReference' && processedResource.date) {
          try {
            processedResource.date = new Date(processedResource.date).toISOString();
          } catch {
            delete processedResource.date;
          }
        }

        // Use PATCH for the Patient resource to add the Metriport identifier without overwriting
        // existing patient data. A PUT operation would replace the entire resource.
        if (resourceType === 'Patient') {
          return {
            fullUrl: entry.fullUrl,
            request: {
              method: 'PATCH',
              url: `Patient/${medplumPatientId}`,
            },
            resource: {
              resourceType: 'Binary',
              contentType: ContentType.JSON_PATCH,
              data: Buffer.from(
                JSON.stringify([{ op: 'add', path: '/identifier', value: [metriportIdentifier] }]),
                'utf8'
              ).toString('base64'),
            },
          };
        }

        return {
          fullUrl: entry.fullUrl,
          request: {
            method: 'PUT',
            url: `${resourceType}?identifier=${originalId}`,
          },
          resource: processedResource,
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

import {
  allOk,
  BotEvent,
  convertContainedResourcesToBundle,
  encodeBase64,
  getIdentifier,
  getReferenceString,
  MedplumClient,
  normalizeErrorString,
} from '@medplum/core';
import {
  Account,
  Bundle,
  BundleEntryRequest,
  DiagnosticReport,
  Observation,
  OperationOutcome,
  Organization,
  Parameters,
  Patient,
  Practitioner,
  PractitionerRole,
  ProjectSecret,
  RequestGroup,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { createHmac } from 'crypto';
import fetch from 'node-fetch';

interface HealthGorillaConfig {
  baseUrl: string;
  audienceUrl: string;
  clientId: string;
  clientSecret: string;
  clientUri: string;
  userLogin: string;
  tenantId: string;
  subtenantId: string;
  subtenantAccountNumber: string;
  scopes: string;
  callbackBotId: string;
  callbackClientId: string;
  callbackClientSecret: string;
}

type HealthGorillaResource =
  | Account
  | DiagnosticReport
  | Observation
  | Organization
  | Patient
  | Practitioner
  | PractitionerRole
  | RequestGroup
  | ServiceRequest;

type HealthGorillaResourceType = HealthGorillaResource['resourceType'];

const HEALTH_GORILLA_SYSTEM = 'https://www.healthgorilla.com';

const referenceMap = new Map<string, string>();

/**
 * Main entry point for the Health Gorilla webhook bot.
 *
 * This bot receives a Health Gorilla resource and syncs it to Medplum.
 *
 * Health Gorilla uses "contained resources" to represent related resources.
 *
 * In Medplum, we recommend that you use references instead of contained resources,
 * which is often better for data quality and analytics.
 *
 * The majority of this bot is dedicated to rewriting references from Health Gorilla.
 *
 * @param medplum - The Medplum client.
 * @param event - The Bot execution event with a Health Gorilla resource.
 * @returns Returns OK OperationOutcome on success, or an error OperationOutcome on failure.
 */
export async function handler(
  medplum: MedplumClient,
  event: BotEvent<HealthGorillaResource>
): Promise<OperationOutcome> {
  const resource = event.input;

  // Move the Health Gorilla resource ID to an identifier
  if (resource.id) {
    const identifiers = resource.identifier ?? [];
    identifiers.push({ system: HEALTH_GORILLA_SYSTEM, value: resource.id });
    resource.identifier = identifiers;
  }

  // Convert the Health Gorilla resource to a Medplum bundle.
  // This moves contained resources to separate create/update operations.
  const healthGorillaBundle = convertContainedResourcesToBundle(resource) as Bundle<HealthGorillaResource>;

  // Touch up the bundle before executing
  // This adds identifiers and ifNoneExist to the bundle entries
  touchUpBundle(healthGorillaBundle);

  try {
    // Rewrite references to other resources
    // For example, convert references to Patient and Organization resources
    // from Health Gorilla references to Medplum references
    await rewriteReferences(medplum, healthGorillaBundle);

    // Execute the bundle
    const result = await medplum.executeBatch(healthGorillaBundle);
    for (const entry of result.entry ?? []) {
      if (entry.response) {
        console.log(entry.response.status, entry.response.location);
      }
    }

    // If we created the top level ResourceGroup or DiagnosticReport,
    // then get the PDF from Health Gorilla
    if (resource.resourceType === 'RequestGroup' || resource.resourceType === 'DiagnosticReport') {
      const entry = result.entry?.find(
        (e) => e.response?.status === '201' && e.response?.location?.startsWith(resource.resourceType + '/')
      );
      if (entry?.resource) {
        await attachPdf(medplum, event);
      }
    }
  } catch (err) {
    console.log(normalizeErrorString(err));
  }

  return allOk;
}

/**
 * Returns the Health Gorilla config settings from the Medplum project secrets.
 * If any required config values are missing, this method will throw and the bot will terminate.
 * @param event - The bot input event.
 * @returns The Health Gorilla config settings.
 */
function getHealthGorillaConfig(event: BotEvent): HealthGorillaConfig {
  const secrets = event.secrets;
  return {
    baseUrl: requireStringSecret(secrets, 'HEALTH_GORILLA_BASE_URL'),
    audienceUrl: requireStringSecret(secrets, 'HEALTH_GORILLA_AUDIENCE_URL'),
    clientId: requireStringSecret(secrets, 'HEALTH_GORILLA_CLIENT_ID'),
    clientSecret: requireStringSecret(secrets, 'HEALTH_GORILLA_CLIENT_SECRET'),
    clientUri: requireStringSecret(secrets, 'HEALTH_GORILLA_CLIENT_URI'),
    userLogin: requireStringSecret(secrets, 'HEALTH_GORILLA_USER_LOGIN'),
    tenantId: requireStringSecret(secrets, 'HEALTH_GORILLA_TENANT_ID'),
    subtenantId: requireStringSecret(secrets, 'HEALTH_GORILLA_SUBTENANT_ID'),
    subtenantAccountNumber: requireStringSecret(secrets, 'HEALTH_GORILLA_SUBTENANT_ACCOUNT_NUMBER'),
    scopes: requireStringSecret(secrets, 'HEALTH_GORILLA_SCOPES'),
    callbackBotId: requireStringSecret(secrets, 'HEALTH_GORILLA_CALLBACK_BOT_ID'),
    callbackClientId: requireStringSecret(secrets, 'HEALTH_GORILLA_CALLBACK_CLIENT_ID'),
    callbackClientSecret: requireStringSecret(secrets, 'HEALTH_GORILLA_CALLBACK_CLIENT_SECRET'),
  };
}

function requireStringSecret(secrets: Record<string, ProjectSecret>, name: string): string {
  const secret = secrets[name];
  if (!secret?.valueString) {
    throw new Error(`Missing secret: ${name}`);
  }
  return secret.valueString;
}

/**
 * Connects to the Health Gorilla API and returns a FHIR client.
 * @param config - The Health Gorilla config settings.
 * @returns The FHIR client.
 */
async function connectToHealthGorilla(config: HealthGorillaConfig): Promise<MedplumClient> {
  const healthGorilla = new MedplumClient({
    fetch,
    baseUrl: config.baseUrl,
    tokenUrl: config.baseUrl + '/oauth/token',
    onUnauthenticated: () => console.error('Unauthenticated'),
  });

  const header = {
    typ: 'JWT',
    alg: 'HS256',
  };

  const currentTimestamp = Math.floor(Date.now() / 1000);

  const data = {
    aud: config.audienceUrl,
    iss: config.clientUri,
    sub: config.userLogin,
    iat: currentTimestamp,
    exp: currentTimestamp + 604800, // expiry time is 7 days from time of creation
  };

  const encodedHeader = encodeBase64(JSON.stringify(header));
  const encodedData = encodeBase64(JSON.stringify(data));
  const token = `${encodedHeader}.${encodedData}`;
  const signature = createHmac('sha256', config.clientSecret).update(token).digest('base64url');
  const signedToken = `${token}.${signature}`;
  await healthGorilla.startJwtBearerLogin(config.clientId, signedToken, config.scopes);
  return healthGorilla;
}

/**
 * Touches up the bundle before executing.
 *
 * As part of the conversion from Health Gorilla to Medplum, we need to add identifiers to the resources,
 * so that we can connect/reuse resources that already exist in Medplum.
 *
 * We also take advantage of the "ifNoneExist" feature of FHIR to avoid creating duplicate resources.
 *
 * @param bundle - The Health Gorilla bundle.
 */
function touchUpBundle(bundle: Bundle<HealthGorillaResource>): void {
  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource as HealthGorillaResource;
    const request = entry.request as BundleEntryRequest;

    if (resource.resourceType === 'Account') {
      // In Health Gorilla, Account connects a Patient and a payment method
      // So we use the combination of those references as the Account identifier
      const identifier = resource.guarantor?.[0]?.party?.reference + '-' + resource?.type?.coding?.[0]?.code;
      if (!resource.identifier) {
        resource.identifier = [];
      }
      resource.identifier.push({ system: HEALTH_GORILLA_SYSTEM, value: identifier });
      request.ifNoneExist = 'identifier=' + identifier;
    }

    if (resource.resourceType === 'PractitionerRole') {
      // In Health Gorilla, PractitionerRole connects a Practitioner and an Organization
      // So we use the combination of those references as the PractitionerRole identifier
      const identifier = resource.practitioner?.reference + '-' + resource.organization?.reference;
      if (!resource.identifier) {
        resource.identifier = [];
      }
      resource.identifier.push({ system: HEALTH_GORILLA_SYSTEM, value: identifier });
      request.ifNoneExist = 'identifier=' + identifier;
    }

    if (
      resource.resourceType === 'DiagnosticReport' ||
      resource.resourceType === 'RequestGroup' ||
      resource.resourceType === 'Organization'
    ) {
      const identifier = getIdentifier(resource, HEALTH_GORILLA_SYSTEM);
      if (identifier) {
        request.ifNoneExist = 'identifier=' + identifier;
      }
    }

    if (resource.resourceType === 'ServiceRequest') {
      // The ServiceRequest identifier is the requisition and the code
      const requisition = resource.requisition?.value;
      const code = resource.code?.coding?.[0]?.code;
      const identifier = requisition + '-' + code;
      if (!resource.identifier) {
        resource.identifier = [];
      }
      resource.identifier.push({ system: HEALTH_GORILLA_SYSTEM, value: identifier });
      request.ifNoneExist = 'identifier=' + identifier;
    }
  }
}

/**
 * Rewrites Health Gorilla references to Medplum references.
 *
 * @param medplum - The Medplum client.
 * @param value - An unknown value.
 */
async function rewriteReferences(medplum: MedplumClient, value: unknown): Promise<void> {
  if (!value) {
    return;
  }
  if (Array.isArray(value)) {
    await rewriteReferencesInArray(medplum, value);
  } else if (typeof value === 'object') {
    await rewriteReferencesInObject(medplum, value as Record<string, unknown>);
  }
}

async function rewriteReferencesInArray(medplum: MedplumClient, array: unknown[]): Promise<void> {
  for (const entry of array) {
    await rewriteReferences(medplum, entry);
  }
}

async function rewriteReferencesInObject(medplum: MedplumClient, obj: Record<string, unknown>): Promise<void> {
  if ('reference' in obj && typeof obj.reference === 'string') {
    // Rewrite the reference
    const reference = obj.reference;
    if (referenceMap.has(reference)) {
      obj.reference = referenceMap.get(reference);
      console.log('Rewrite', reference, '->', obj.reference);
    } else if (reference.includes('/')) {
      const [resourceType, id] = reference.split('/');
      const resource = await searchByHealthGorillaId(medplum, resourceType as HealthGorillaResourceType, id);
      if (resource) {
        referenceMap.set(reference, getReferenceString(resource));
        obj.reference = getReferenceString(resource);
        console.log('Rewrite', getReferenceString(resource), '->', obj.reference);
      } else {
        console.log('WARNING: Could not find reference', reference);
      }
    }
    return;
  }
  // Recursively rewrite the object
  for (const child of Object.values(obj)) {
    await rewriteReferences(medplum, child);
  }
}

/**
 * Tries to find a Medplum resource by Health Gorilla ID.
 *
 * In most cases, this is a matter of search by "identifier" rather than "id".
 *
 * There are some special cases where "identifier" is not available.
 *
 * @param medplum - The Medplum client.
 * @param resourceType - The FHIR resource type.
 * @param id - The Health Gorilla resource ID.
 * @returns The Medplum resource, or undefined if not found.
 */
async function searchByHealthGorillaId(
  medplum: MedplumClient,
  resourceType: HealthGorillaResourceType,
  id: string
): Promise<HealthGorillaResource | undefined> {
  if (resourceType === 'ServiceRequest') {
    // Special case for ServiceRequest - search by requisition instead of identifier
    // Because Health Gorilla does not include the identifier
    const requisition = id.split('-')[0];
    return medplum.searchOne(resourceType, { requisition });
  }

  // Default case - search by identifier
  return medplum.searchOne(resourceType, { identifier: `${HEALTH_GORILLA_SYSTEM}|${id}` });
}

/**
 * Downloads the PDF from Health Gorilla and attaches it to the Medplum resource as a Media resource.
 * @param medplum - The Medplum client.
 * @param event - The Bot execution event with a Health Gorilla resource.
 */
async function attachPdf<T extends HealthGorillaResource>(medplum: MedplumClient, event: BotEvent<T>): Promise<void> {
  const resource = event.input;
  const id = getIdentifier(resource, HEALTH_GORILLA_SYSTEM);
  const config = getHealthGorillaConfig(event);
  const healthGorilla = await connectToHealthGorilla(config);

  // Use the HealthGorilla "$pdf" operation to get the PDF URL
  const pdfResult = await healthGorilla.get(healthGorilla.fhirUrl(resource.resourceType, id as string, '$pdf'));

  // Get the PDF URL from the Parameters resource
  const pdfUrl = (pdfResult as Parameters).parameter?.find((p) => p.name === 'url')?.valueString as string;
  const pdfBlob = await healthGorilla.download(pdfUrl, { headers: { Accept: 'application/pdf' } });

  // node-fetch does not allow streaming from a Response object
  // So read the PDF into memory first
  const pdfArrayBuffer = await pdfBlob.arrayBuffer();
  const pdfUint8Array = new Uint8Array(pdfArrayBuffer);

  // Create a Medplum media resource
  const media = await medplum.uploadMedia(pdfUint8Array, 'application/pdf', resource.resourceType + '.pdf');
  console.log('Uploaded PDF as media: ' + media.id);
}

import { encodeBase64, MedplumClient, MedplumClientOptions } from '@medplum/core';
import { Parameters, RequestGroup, Subscription } from '@medplum/fhirtypes';
import { createHmac } from 'node:crypto';

export interface HealthGorillaConfig {
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

/**
 * Returns the Health Gorilla config settings from the Medplum project secrets.
 * If any required config values are missing, this method will throw and the bot will terminate.
 * @returns The Health Gorilla config settings.
 */
export function getHealthGorillaConfig(): HealthGorillaConfig {
  return {
    baseUrl: requireEnvVar('HEALTH_GORILLA_BASE_URL'),
    audienceUrl: requireEnvVar('HEALTH_GORILLA_AUDIENCE_URL'),
    clientId: requireEnvVar('HEALTH_GORILLA_CLIENT_ID'),
    clientSecret: requireEnvVar('HEALTH_GORILLA_CLIENT_SECRET'),
    clientUri: requireEnvVar('HEALTH_GORILLA_CLIENT_URI'),
    userLogin: requireEnvVar('HEALTH_GORILLA_USER_LOGIN'),
    tenantId: requireEnvVar('HEALTH_GORILLA_TENANT_ID'),
    subtenantId: requireEnvVar('HEALTH_GORILLA_SUBTENANT_ID'),
    subtenantAccountNumber: requireEnvVar('HEALTH_GORILLA_SUBTENANT_ACCOUNT_NUMBER'),
    scopes: requireEnvVar('HEALTH_GORILLA_SCOPES'),
    callbackBotId: requireEnvVar('HEALTH_GORILLA_CALLBACK_BOT_ID'),
    callbackClientId: requireEnvVar('HEALTH_GORILLA_CALLBACK_CLIENT_ID'),
    callbackClientSecret: requireEnvVar('HEALTH_GORILLA_CALLBACK_CLIENT_SECRET'),
  };
}

/**
 * Connects to the Health Gorilla API and returns a FHIR client.
 * @param config - The Health Gorilla config settings.
 * @param clientOptions - Optional FHIR client options.
 * @returns The FHIR client.
 */
export async function connectToHealthGorilla(
  config: HealthGorillaConfig,
  clientOptions?: MedplumClientOptions
): Promise<MedplumClient> {
  const healthGorilla = new MedplumClient({
    ...clientOptions,
    baseUrl: config.baseUrl,
    tokenUrl: config.baseUrl + '/oauth/token',
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
 * Ensures that there are active subscriptions for the main resource types.
 * Health Gorilla uses subscriptions to notify Medplum when new lab results are available.
 * If there are no subscriptions, this method will create them.
 * If the subscriptions are in "error" status, this method will delete them and create new ones.
 * If the subscriptions are in "active" status, this method will do nothing.
 *
 * @param config - The Health Gorilla config settings.
 * @param healthGorilla - The Health Gorilla FHIR client.
 */
export async function ensureSubscriptions(config: HealthGorillaConfig, healthGorilla: MedplumClient): Promise<void> {
  // Get all subscriptions
  const subscriptions = await healthGorilla.searchResources('Subscription');
  await ensureSubscription(config, healthGorilla, subscriptions, 'RequestGroup');
  await ensureSubscription(config, healthGorilla, subscriptions, 'ServiceRequest');
  await ensureSubscription(config, healthGorilla, subscriptions, 'DiagnosticReport');
}

/**
 * Ensures that there is an active subscription for the given criteria.
 *
 * @param config - The Health Gorilla config settings.
 * @param healthGorilla - The Health Gorilla FHIR client.
 * @param existingSubscriptions - The existing subscriptions.
 * @param criteria - The subscription criteria.
 */
export async function ensureSubscription(
  config: HealthGorillaConfig,
  healthGorilla: MedplumClient,
  existingSubscriptions: Subscription[],
  criteria: string
): Promise<void> {
  const existingSubscription = existingSubscriptions.find((s) => s.criteria === criteria && s.status === 'active');
  if (existingSubscription) {
    console.log(`Subscription for "${criteria}" already exists: ${existingSubscription.id}`);
    return;
  }

  // Otherwise, create a new subscription
  const newSubscription = await healthGorilla.createResource<Subscription>({
    resourceType: 'Subscription',
    status: 'active',
    end: '2030-01-01T00:00:00.000+00:00',
    reason: `Send webhooks for ${criteria} resources`,
    criteria,
    channel: {
      type: 'rest-hook',
      endpoint: `https://api.medplum.com/fhir/R4/Bot/${config.callbackBotId}/$execute`,
      payload: 'application/fhir+json',
      header: ['Authorization: Basic ' + encodeBase64(config.callbackClientId + ':' + config.callbackClientSecret)],
    },
  });
  console.log(`Created new subscription for "${criteria}": ${newSubscription.id}`);
}

export function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function assertNotEmpty<T>(value: T | undefined, message: string): asserts value is T {
  if (!value) {
    throw new Error(message);
  }
}

/**
 * Checks the RequestGroup for an ABN (Advanced Beneficiary Notice).
 *
 * See: https://developer.healthgorilla.com/docs/diagnostic-network#abn
 *
 * @param medplum - The Medplum FHIR client.
 * @param healthGorilla - The Health Gorilla FHIR client.
 * @param requestGroup - The newly created RequestGroup.
 */
export async function checkAbn(
  medplum: MedplumClient,
  healthGorilla: MedplumClient,
  requestGroup: RequestGroup & { id: string }
): Promise<void> {
  // Use the HealthGorilla "$abn" operation to get the PDF URL
  const abnResult = await healthGorilla.get(healthGorilla.fhirUrl(requestGroup.resourceType, requestGroup.id, '$abn'));

  // Get the ABN PDF URL from the Parameters resource
  const abnUrl = (abnResult as Parameters).parameter?.find((p) => p.name === 'url')?.valueString;
  if (abnUrl) {
    const abnBlob = await healthGorilla.download(abnUrl, { headers: { Accept: 'application/pdf' } });

    // node-fetch does not allow streaming from a Response object
    // So read the PDF into memory first
    const abnArrayBuffer = await abnBlob.arrayBuffer();
    const abnUint8Array = new Uint8Array(abnArrayBuffer);

    // Create a Medplum media resource
    const media = await medplum.createMedia({
      data: abnUint8Array,
      contentType: 'application/pdf',
      filename: 'RequestGroup-ABN.pdf',
    });
    console.log('Uploaded ABN PDF as media: ' + media.id);
  }
}

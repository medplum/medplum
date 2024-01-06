import { allOk, BotEvent, encodeBase64, MedplumClient } from '@medplum/core';
import { OperationOutcome, QuestionnaireResponse, Subscription } from '@medplum/fhirtypes';
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

export async function handler(
  _medplum: MedplumClient,
  _event: BotEvent<QuestionnaireResponse>
): Promise<OperationOutcome> {
  // Parse the secrets
  // Make sure all required Health Gorilla config values are present
  const config = getHealthGorillaConfig();

  // Connect to Health Gorilla
  const healthGorilla = await connectToHealthGorilla(config);

  // Ensure active subscriptions
  await ensureSubscriptions(config, healthGorilla);

  return allOk;
}

/**
 * Returns the Health Gorilla config settings from the Medplum project secrets.
 * If any required config values are missing, this method will throw and the bot will terminate.
 * @returns The Health Gorilla config settings.
 */
function getHealthGorillaConfig(): HealthGorillaConfig {
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

function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
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

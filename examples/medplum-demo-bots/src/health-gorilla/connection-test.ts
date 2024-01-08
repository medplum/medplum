import { allOk, BotEvent, encodeBase64, MedplumClient } from '@medplum/core';
import { OperationOutcome, QuestionnaireResponse } from '@medplum/fhirtypes';
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

  // Get all subscriptions
  const subscriptions = await healthGorilla.searchResources('Subscription');
  console.log('Subscription count: ' + subscriptions.length);

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

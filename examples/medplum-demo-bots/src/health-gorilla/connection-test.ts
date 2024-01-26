import { allOk, BotEvent, encodeBase64, MedplumClient } from '@medplum/core';
import { OperationOutcome, QuestionnaireResponse } from '@medplum/fhirtypes';
import { createHmac } from 'crypto';
import fetch from 'node-fetch';
import { getHealthGorillaConfig } from './utils';

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
  event: BotEvent<QuestionnaireResponse>
): Promise<OperationOutcome> {
  // Parse the secrets
  // Make sure all required Health Gorilla config values are present
  const config = getHealthGorillaConfig(event.secrets);

  // Connect to Health Gorilla
  const healthGorilla = await connectToHealthGorilla(config);

  // Get all subscriptions
  const subscriptions = await healthGorilla.searchResources('Subscription', 'status=active');
  console.log('Active Subscription count: ' + subscriptions.length);

  return allOk;
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

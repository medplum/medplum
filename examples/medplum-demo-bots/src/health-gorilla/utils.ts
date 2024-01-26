import { BotEvent } from '@medplum/core';

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
 * @param secrets - (optional) Project-level secrets
 * @returns The Health Gorilla config settings.
 */
export function getHealthGorillaConfig(secrets?: BotEvent['secrets']): HealthGorillaConfig {
  return {
    baseUrl: requireSecret('HEALTH_GORILLA_BASE_URL', secrets),
    audienceUrl: requireSecret('HEALTH_GORILLA_AUDIENCE_URL', secrets),
    clientId: requireSecret('HEALTH_GORILLA_CLIENT_ID', secrets),
    clientSecret: requireSecret('HEALTH_GORILLA_CLIENT_SECRET', secrets),
    clientUri: requireSecret('HEALTH_GORILLA_CLIENT_URI', secrets),
    userLogin: requireSecret('HEALTH_GORILLA_USER_LOGIN', secrets),
    tenantId: requireSecret('HEALTH_GORILLA_TENANT_ID', secrets),
    subtenantId: requireSecret('HEALTH_GORILLA_SUBTENANT_ID', secrets),
    subtenantAccountNumber: requireSecret('HEALTH_GORILLA_SUBTENANT_ACCOUNT_NUMBER', secrets),
    scopes: requireSecret('HEALTH_GORILLA_SCOPES', secrets),
    callbackBotId: requireSecret('HEALTH_GORILLA_CALLBACK_BOT_ID', secrets),
    callbackClientId: requireSecret('HEALTH_GORILLA_CALLBACK_CLIENT_ID', secrets),
    callbackClientSecret: requireSecret('HEALTH_GORILLA_CALLBACK_CLIENT_SECRET', secrets),
  };
}

function requireSecret(name: string, secrets?: BotEvent['secrets']): string {
  // First, try reading from env var
  let value = secrets?.[name].valueString;
  if (!value) {
    value = process.env[name];
  }
  if (!value) {
    throw new Error(`Missing secret: ${name}`);
  }

  return value;
}

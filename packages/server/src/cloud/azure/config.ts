// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { splitN } from '@medplum/core';
import { MedplumServerConfig } from '../../config/types';
import { isBooleanConfig, isIntegerConfig, isObjectConfig } from '../../config/utils';

/**
 * Gets the latest secret value from Key Vault.
 * Uses Workload ID for authentication.
 * @param keyvaultURL - The Azure KeyVault URL
 * @param secretName - The secret Name
 * @returns The secret value as string.
 */
async function getSecretValue(keyvaultURL: string, secretName: string): Promise<string> {
  const credential = new DefaultAzureCredential();
  const client = new SecretClient(keyvaultURL, credential);

  const secretData = await client.getSecret(secretName);

  const payload = secretData.value;

  if (!payload) {
    throw new Error('Secret payload is empty');
  }

  return payload;
}

/**
 * Loads configuration settings from Azure Key Vault.
 * @param configPath - The KeyVault URL and Secret Name. ex: medplum-vault.vault.azure.net:medplum-config)
 * IMPORTANT: the keyVaultURL should be in the format <vault-name>.vault.azure.net without the https:// and trailing slash. This is
 * due to using the splitN function to separate the parameters by ":"
 * The https:// is added and a valid URL is passed to the getSecretValue function
 * @returns The loaded configuration.
 */
export async function loadAzureConfig(configPath: string): Promise<MedplumServerConfig> {
  const config: Record<string, any> = {};
  const [keyvaultURL, secretName] = splitN(configPath, ':', 2);

  const secret = await getSecretValue('https://' + keyvaultURL, secretName);
  const secretData = JSON.parse(secret) as Record<string, string>;

  for (const [key, value] of Object.entries(secretData)) {
    setValue(config, key, value);
  }

  return config as MedplumServerConfig;
}

function setValue(config: Record<string, unknown>, key: string, value: string): void {
  const keySegments = key.split('.');
  let obj = config;

  while (keySegments.length > 1) {
    const segment = keySegments.shift() as string;
    if (!obj[segment]) {
      obj[segment] = {};
    }
    obj = obj[segment] as Record<string, unknown>;
  }

  let parsedValue: any = value;
  if (isIntegerConfig(key)) {
    parsedValue = parseInt(value, 10);
  } else if (isBooleanConfig(key)) {
    parsedValue = value === 'true';
  } else if (isObjectConfig(key)) {
    parsedValue = JSON.parse(value);
  }

  obj[keySegments[0]] = parsedValue;
}

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { splitN } from '@medplum/core';
import { isBooleanConfig, isIntegerConfig, isObjectConfig, MedplumServerConfig } from '../../config';

/**
 * Gets the latest secret value from Google Secret Manager.
 * Uses DEFAULT_APPLICATION_CREDENTIALS for authentication.
 * @param projectId - The GCP project ID
 * @param secretId - The GCP secret ID
 * @returns The secret value as string.
 */
async function getSecretValue(projectId: string, secretId: string): Promise<string> {
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${projectId}/secrets/${secretId}/versions/latest`,
  });

  const payload = version.payload?.data?.toString();

  if (!payload) {
    throw new Error('Secret payload is empty');
  }

  return payload;
}

/**
 * Loads configuration settings from GCP Secrets Manager.
 * @param configPath - The GCP project and secret ID. (e.g.: medplum:dev-config)
 * @returns The loaded configuration.
 */
export async function loadGcpConfig(configPath: string): Promise<MedplumServerConfig> {
  const config: Record<string, any> = {};
  let [projectId, secretId] = splitN(configPath, ':', 2);

  const secret = await getSecretValue(projectId, secretId);
  const secretData = JSON.parse(secret);

  // Then load other parameters, which may override the secrets
  for (const key in secretData) {
    if (secretData.hasOwnProperty(key)) {
      setValue(config, key, secretData[key]);
    }
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

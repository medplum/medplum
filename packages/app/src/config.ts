export interface MedplumAppConfig {
  baseUrl?: string;
  clientId?: string;
  googleClientId?: string;
  recaptchaSiteKey?: string;
  registerEnabled?: boolean | string;
  awsTextractEnabled?: boolean | string;
}

const config: MedplumAppConfig = {
  baseUrl: import.meta.env?.MEDPLUM_BASE_URL,
  clientId: import.meta.env?.MEDPLUM_CLIENT_ID,
  googleClientId: import.meta.env?.GOOGLE_CLIENT_ID,
  recaptchaSiteKey: import.meta.env?.RECAPTCHA_SITE_KEY,
  registerEnabled: import.meta.env?.MEDPLUM_REGISTER_ENABLED,
  awsTextractEnabled: import.meta.env?.MEDPLUM_AWS_TEXTRACT_ENABLED,
};

export function getConfig(): MedplumAppConfig {
  return config;
}

export function isRegisterEnabled(): boolean {
  return isFeatureEnabled('registerEnabled');
}

export function isAwsTextractEnabled(): boolean {
  return isFeatureEnabled('awsTextractEnabled');
}

function isFeatureEnabled(feature: keyof MedplumAppConfig): boolean {
  // This try/catch exists to prevent Rollup optimization from removing this function
  try {
    return config[feature] !== false && config[feature] !== 'false';
  } catch {
    return true;
  }
}

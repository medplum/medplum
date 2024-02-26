export interface MedplumAppConfig {
  baseUrl?: string;
  clientId?: string;
  googleClientId?: string;
  recaptchaSiteKey?: string;
  registerEnabled?: boolean | string;
}

const config: MedplumAppConfig = {
  baseUrl: import.meta.env?.MEDPLUM_BASE_URL,
  clientId: import.meta.env?.MEDPLUM_CLIENT_ID,
  googleClientId: import.meta.env?.GOOGLE_CLIENT_ID,
  recaptchaSiteKey: import.meta.env?.RECAPTCHA_SITE_KEY,
  registerEnabled: import.meta.env?.MEDPLUM_REGISTER_ENABLED,
};

export function getConfig(): MedplumAppConfig {
  return config;
}

export function isRegisterEnabled(): boolean {
  // This try/catch exists to prevent Rollup optimization from removing this function
  try {
    return config.registerEnabled !== false && config.registerEnabled !== 'false';
  } catch {
    return true;
  }
}

export interface MedplumAppConfig {
  baseUrl: string;
  clientId?: string;
  googleClientId?: string;
  recaptchaSiteKey?: string;
  registerEnabled?: boolean;
}

const config: MedplumAppConfig = {
  baseUrl: import.meta.env?.MEDPLUM_BASE_URL as string,
  clientId: import.meta.env?.MEDPLUM_CLIENT_ID || undefined,
  googleClientId: import.meta.env?.GOOGLE_CLIENT_ID || undefined,
  recaptchaSiteKey: import.meta.env?.RECAPTCHA_SITE_KEY || undefined,
  registerEnabled: import.meta.env?.MEDPLUM_REGISTER_ENABLED !== 'false', // default true
};

export function getConfig(): MedplumAppConfig {
  return config;
}

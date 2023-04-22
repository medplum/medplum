export interface MedplumAppConfig {
  baseUrl: string;
  clientId?: string;
  googleClientId?: string;
  recaptchaSiteKey?: string;
  registerEnabled?: boolean;
}

const config: MedplumAppConfig = {
  baseUrl: process.env.MEDPLUM_BASE_URL as string,
  clientId: process.env.MEDPLUM_CLIENT_ID || undefined,
  googleClientId: process.env.GOOGLE_CLIENT_ID || undefined,
  recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || undefined,
  registerEnabled: process.env.MEDPLUM_REGISTER_ENABLED !== 'false', // default true
};

export function getConfig(): MedplumAppConfig {
  return config;
}

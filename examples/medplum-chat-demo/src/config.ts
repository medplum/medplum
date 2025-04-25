export interface MedplumAppConfig {
  baseUrl?: string;
  googleClientId?: string;
  clientId?: string;
}

const config: MedplumAppConfig = {
  baseUrl: import.meta.env?.MEDPLUM_BASE_URL,
  googleClientId: import.meta.env?.GOOGLE_CLIENT_ID,
  clientId: import.meta.env?.MEDPLUM_CLIENT_ID,
};

export function getConfig(): MedplumAppConfig {
  return config;
}

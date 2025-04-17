export interface MedplumAppConfig {
  baseUrl?: string;
  googleClientId?: string;
  clientId?: string;
}

const config: MedplumAppConfig = {
  baseUrl: import.meta.env?.MEDPLUM_BASE_URL || 'https://api.medplum.com/',
  googleClientId: import.meta.env?.GOOGLE_CLIENT_ID || "921088377005-3j1sa10vr6hj86jgmdfh2l53v3mp7lfi.apps.googleusercontent.com",
  clientId: import.meta.env?.MEDPLUM_CLIENT_ID
};

export function getConfig(): MedplumAppConfig {
  return config;
}
export interface MedplumGraphiQLConfig {
  introspectionUrl?: string;
}

const config: MedplumGraphiQLConfig = {
  introspectionUrl: import.meta.env.MEDPLUM_INTROSPECTION_URL || undefined,
};

export function getConfig(): MedplumGraphiQLConfig {
  return config;
}

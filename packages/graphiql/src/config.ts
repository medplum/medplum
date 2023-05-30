export interface MedplumGraphiQLConfig {
  introspectionUrl: string;
}

const config: MedplumGraphiQLConfig = {
  introspectionUrl: process.env.MEDPLUM_INTROSPECTION_URL || '/schema/schema-v4.json',
};

export function getConfig(): MedplumGraphiQLConfig {
  return config;
}

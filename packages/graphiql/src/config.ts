export interface MedplumGraphiQLConfig {
  introspectionFilePath: string;
}

const config: MedplumGraphiQLConfig = {
  introspectionFilePath: process.env.MEDPLUM_INTROSPECTION_FILE_PATH || '/schema/schema-v4.json',
};

export function getConfig(): MedplumGraphiQLConfig {
  return config;
}

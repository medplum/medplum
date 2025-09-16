// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export interface MedplumGraphiQLConfig {
  introspectionUrl?: string;
}

const config: MedplumGraphiQLConfig = {
  introspectionUrl: import.meta.env.MEDPLUM_INTROSPECTION_URL || undefined,
};

export function getConfig(): MedplumGraphiQLConfig {
  return config;
}

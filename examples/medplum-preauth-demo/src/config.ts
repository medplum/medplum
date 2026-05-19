// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export interface MedplumAppConfig {
  clientId?: string;
  botId?: string;
  googleClientId?: string;
}

const config: MedplumAppConfig = {
  clientId: import.meta.env?.MEDPLUM_CLIENT_ID,
  botId: import.meta.env?.MEDPLUM_BOT_ID,
  googleClientId: import.meta.env?.GOOGLE_CLIENT_ID,
};

export function getConfig(): MedplumAppConfig {
  return config;
}

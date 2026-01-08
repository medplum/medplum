// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Default values to enable Photon Elements. Replace with your own photon credentials for use. https://docs.photon.health/docs/elements
export interface MedplumAppConfig {
  baseUrl?: string;
  googleClientId?: string;
  clientId?: string;
  photonClientId?: string;
  photonOrgId?: string;
}

const config: MedplumAppConfig = {
  baseUrl: import.meta.env?.MEDPLUM_BASE_URL,
  googleClientId: import.meta.env?.GOOGLE_CLIENT_ID,
  clientId: import.meta.env?.MEDPLUM_CLIENT_ID,
  photonClientId: import.meta.env?.PHOTON_CLIENT_ID,
  photonOrgId: import.meta.env?.PHOTON_ORG_ID,
};

export function getConfig(): MedplumAppConfig {
  return config;
}

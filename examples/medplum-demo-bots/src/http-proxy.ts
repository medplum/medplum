// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import { ProxyAgent, fetch } from 'undici';

export async function handler(_medplum: MedplumClient, event: BotEvent): Promise<any> {
  const secrets = event.secrets;
  const proxyHost = secrets.PROXY_HOST?.valueString;
  const proxyPort = secrets.PROXY_PORT?.valueInteger;
  const proxyCaCert = secrets.PROXY_CA_CERT?.valueString;
  const clientCert = secrets.CLIENT_CERT?.valueString;
  const clientKey = secrets.CLIENT_KEY?.valueString;

  const proxyAgent = new ProxyAgent({
    uri: `http://${proxyHost}:${proxyPort}`,
    requestTls: {
      ca: proxyCaCert,
      cert: clientCert,
      key: clientKey,
      rejectUnauthorized: false, // Ignore self-signed certificate errors
    },
  });

  const response = await fetch('https://launch.smarthealthit.org/v/r4/fhir/Patient', {
    dispatcher: proxyAgent,
    method: 'GET',
  });

  console.log('Response status:', response.status);

  return response.json();
}

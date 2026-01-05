// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, CdsResponse, CdsService, CdsUserResource } from '@medplum/core';
import { buildCdsRequest, MedplumClient } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { fetch, ProxyAgent } from 'undici';

export async function handler(medplum: MedplumClient, event: BotEvent<Patient>): Promise<CdsResponse> {
  const secrets = event.secrets;
  const proxyHost = secrets.PROXY_HOST?.valueString;
  const proxyPort = secrets.PROXY_PORT?.valueInteger;
  const proxyCaCert = secrets.PROXY_CA_CERT?.valueString;
  const clientCert = secrets.CLIENT_CERT?.valueString;
  const clientKey = secrets.CLIENT_KEY?.valueString;

  // Build the proxy agent
  const proxyAgent = new ProxyAgent({
    uri: `http://${proxyHost}:${proxyPort}`,
    requestTls: {
      ca: proxyCaCert,
      cert: clientCert,
      key: clientKey,
      rejectUnauthorized: false, // Ignore self-signed certificate errors
    },
  });

  // Create a fetch function that uses the proxy agent
  const proxiedFetch: typeof fetch = async (url, options) => {
    console.log('Fetching URL via proxy:', url);
    return fetch(url, { ...options, dispatcher: proxyAgent });
  };

  // Create a separate client for CDS service calls
  const cdsClient = new MedplumClient({
    baseUrl: 'https://sandbox-services.cds-hooks.org/',
    fetch: proxiedFetch,
  });

  // Use the requester as the CDS user
  const user = event.requester as CdsUserResource;

  // Discover and call the CDS service
  const services = (await cdsClient.getCdsServices()).services;

  // For this example, we assume we want the 'patient-view' hook
  const service = services.find((s) => s.hook === 'patient-view') as CdsService;

  // Use Homer Simpson's patient ID as an example
  const context = { patientId: event.input.id };

  // Build the CDS request
  // Note that we use the Medplum client to build the request
  // That's because we're going to need FHIR resources from the Medplum server
  const request = await buildCdsRequest(medplum, user, service, context);

  // Call the CDS service
  return cdsClient.callCdsService(service.id, request);
}

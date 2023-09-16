import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { createPrivateKey, randomBytes } from 'crypto';
import { SignJWT } from 'jose';
import fetch from 'node-fetch';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<Patient | undefined> {
  const privateKeyString = event.secrets['EPIC_PRIVATE_KEY'] as string;
  const clientId = event.secrets['EPIC_CLIENT_ID'] as string;
  if (!privateKeyString || !clientId) {
    return undefined;
  }

  const privateKey = createPrivateKey(privateKeyString);
  const baseUrl = 'https://fhir.epic.com/interconnect-fhir-oauth/';
  const tokenUrl = 'https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token';
  const fhirUrlPath = 'api/FHIR/R4/';

  // Construct Epic MedplumClient base
  const epicClient = new MedplumClient({
    fetch,
    baseUrl: baseUrl,
    tokenUrl: tokenUrl,
    fhirUrlPath: fhirUrlPath,
    clientId: clientId,
    onUnauthenticated: () => console.error('Unauthenticated'),
  });

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS384', typ: 'JWT' })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(baseUrl + 'oauth2/token')
    .setJti(randomBytes(16).toString('hex'))
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

  const formBody = new URLSearchParams();
  formBody.append('grant_type', 'client_credentials');
  formBody.append('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
  formBody.append('client_assertion', jwt);

  // Authorize
  const res = await epicClient.post(tokenUrl, formBody.toString(), 'application/x-www-form-urlencoded', {
    credentials: 'include',
  });

  if (!res.access_token) {
    throw new Error(`Failed to login: ${res}`);
  }

  epicClient.setAccessToken(res.access_token);

  console.log('Logged in');

  // Read resource for Camila
  const camila = await epicClient.readResource('Patient', 'erXuFYUfucBZaryVksYEcMg3');

  if (!camila) {
    throw new Error(`Failed to find any patients`);
  }

  // Create resource for Camila in your Local Medplum repository
  await medplum.createResourceIfNoneExist(camila, 'identifier=erXuFYUfucBZaryVksYEcMg3');

  return camila;
}

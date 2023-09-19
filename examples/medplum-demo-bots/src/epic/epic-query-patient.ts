import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { createPrivateKey, randomBytes } from 'crypto';
import { SignJWT } from 'jose';
import fetch from 'node-fetch';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<Patient | undefined> {
  const privateKeyString = event.secrets['EPIC_PRIVATE_KEY'].valueString;
  const clientId = event.secrets['EPIC_CLIENT_ID'].valueString;
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
    baseUrl,
    tokenUrl,
    fhirUrlPath,
    clientId,
  });

  // Construct JWT assertion
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS384', typ: 'JWT' })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(tokenUrl)
    .setJti(randomBytes(16).toString('hex'))
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

  // Start the JWT assertion login
  await epicClient.startJwtAssertionLogin(jwt);

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

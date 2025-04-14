import { BotEvent, createReference, getIdentifier, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { createPrivateKey, randomBytes } from 'crypto';
import { SignJWT } from 'jose';
import fetch from 'node-fetch';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<Patient | undefined> {
  const clientId = event.secrets['EPIC_CLIENT_ID']?.valueString;
  if (!clientId) {
    throw new Error('Missing EPIC_CLIENT_ID');
  }

  // Replace \n with actual newlines is needed to properly parse key stored in secrets
  const privateKeyString = event.secrets['EPIC_PRIVATE_KEY']?.valueString?.replace(/\\n/g, '\n');
  if (!privateKeyString) {
    throw new Error('Missing EPIC_PRIVATE_KEY');
  }

  // TODO: Add a try/catch block
  const privateKey = createPrivateKey(privateKeyString);
  const baseUrl = 'https://fhir.epic.com/interconnect-fhir-oauth/';
  const tokenUrl = 'https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token';
  const fhirUrlPath = 'api/FHIR/R4/';

  // Construct Epic MedplumClient base
  const epic = new MedplumClient({
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
  await epic.startJwtAssertionLogin(jwt);

  // Read resource for patient Camila
  // TODO: Get patient ID from event.input
  const epicPatientId = 'erXuFYUfucBZaryVksYEcMg3';
  const epicPatient = await epic.readResource('Patient', epicPatientId);
  if (!epicPatient) {
    throw new Error(`No patient found for ${epicPatientId} on Epic`);
  }

  // Upsert referenced resources first to ensure they exist in Medplum
  // Note that Epic ID and Medplum ID are different so we need to remove it to execute the upsert
  if (epicPatient.managingOrganization?.reference) {
    const [orgResourceType, orgId] = epicPatient.managingOrganization.reference.split('/');
    if (orgResourceType === 'Organization' && orgId) {
      const epicOrganization = await epic.readResource('Organization', orgId);
      const npiIdentifier = getIdentifier(epicOrganization, 'http://hl7.org/fhir/sid/us-npi');
      const medplumOrganization = await medplum.upsertResource(
        { ...epicOrganization, id: undefined },
        {
          identifier: npiIdentifier,
        }
      );
      epicPatient.managingOrganization = createReference(medplumOrganization);
    }
  }

  if (epicPatient.generalPractitioner) {
    await Promise.all(
      epicPatient.generalPractitioner.map(async (gp) => {
        if (gp?.reference) {
          const [gpResourceType, gpId] = gp.reference.split('/');
          if (gpResourceType === 'Practitioner' && gpId) {
            const epicPractitioner = await epic.readResource('Practitioner', gpId);
            const npiIdentifier = getIdentifier(epicPractitioner, 'http://hl7.org/fhir/sid/us-npi');
            const medplumPractitioner = await medplum.upsertResource(
              { ...epicPractitioner, id: undefined },
              {
                identifier: npiIdentifier,
              }
            );
            gp.reference = createReference(medplumPractitioner).reference;
          }
        }
      })
    );
  }

  const medplumPatient = await medplum.upsertResource(
    { ...epicPatient, id: undefined },
    {
      identifier: epicPatientId,
    }
  );

  return medplumPatient;
}

import { BotEvent, createReference, getIdentifier, getReferenceString, MedplumClient, resolveId } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { createPrivateKey, randomBytes } from 'crypto';
import { SignJWT } from 'jose';
import fetch from 'node-fetch';

/**
 * Handles the logic for the Epic FHIR integration bot.
 *
 * @param medplum - The Medplum client
 * @param event - The BotEvent object
 *
 * @returns The Patient resource in Medplum
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Patient>): Promise<Patient> {
  const clientId = event.secrets['EPIC_CLIENT_ID']?.valueString;
  if (!clientId) {
    throw new Error('Missing EPIC_CLIENT_ID');
  }

  // Handles unknown issue with newlines in private key
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

  const medplumPatient = event.input;
  const epicPatientId = getIdentifier(medplumPatient, 'http://open.epic.com/FHIR/StructureDefinition/patient-fhir-id');

  if (!epicPatientId) {
    console.log('No Epic Patient ID found, creating patient in Epic');
    // If no Epic patient ID exists, create the patient in Epic
    return createEpicPatient(medplum, epic, medplumPatient);
  } else {
    console.log('Epic Patient ID found, syncing data from Epic to Medplum');
    // If an Epic patient ID exists, sync data from Epic to Medplum
    return syncEpicPatient(medplum, epic, medplumPatient, epicPatientId);
  }
}

/**
 * Creates a patient in Epic
 *
 * @param medplum - The Medplum client
 * @param epic - The Epic client
 * @param medplumPatient - The Patient resource in Medplum
 *
 * @returns The Patient resource in Medplum
 */
async function createEpicPatient(
  medplum: MedplumClient,
  epic: MedplumClient,
  medplumPatient: Patient
): Promise<Patient> {
  const ssnIdentifier = getIdentifier(medplumPatient, 'http://hl7.org/fhir/sid/us-ssn');
  if (!ssnIdentifier) {
    throw new Error('SSN identifier is required to create a patient in Epic');
  }

  // Destructure to omit id and meta before creating the resource in Epic
  const { id: _id, meta: _meta, ...patientToCreate } = medplumPatient;

  // Epic requires the SSN identifier to be in the OID system
  patientToCreate.identifier = patientToCreate.identifier?.map((id) => {
    if (id.system === 'http://hl7.org/fhir/sid/us-ssn') {
      return {
        use: 'usual',
        system: 'urn:oid:2.16.840.1.113883.4.1',
        value: id.value,
      };
    }

    return id;
  });

  await epic.createResource<Patient>(patientToCreate);
  const epicPatient = await epic.searchOne('Patient', { identifier: ssnIdentifier });

  if (!epicPatient) {
    throw new Error('Failed to create patient in Epic');
  }

  medplumPatient.identifier ??= [];
  medplumPatient.identifier.push({
    system: 'http://open.epic.com/FHIR/StructureDefinition/patient-fhir-id',
    value: epicPatient.id,
  });

  const updatedMedplumPatient = await medplum.updateResource(medplumPatient);
  return updatedMedplumPatient;
}

/**
 * Syncs data from an existing Epic patient to Medplum
 *
 * @param medplum - The Medplum client
 * @param epic - The Epic client
 * @param medplumPatient - The Patient resource in Medplum
 * @param epicPatientId - The ID of the patient in Epic
 *
 * @returns The Patient resource in Medplum
 */
async function syncEpicPatient(
  medplum: MedplumClient,
  epic: MedplumClient,
  medplumPatient: Patient,
  epicPatientId: string
): Promise<Patient> {
  // Note that Epic ID and Medplum ID are different so that is why id is being removed
  // when performing the upsert below.

  // Read the patient resource from Epic
  const epicPatient = await epic.readResource('Patient', epicPatientId);

  // Upsert referenced resources first to ensure they exist in Medplum.
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
        if (!gp?.reference) {
          return;
        }

        const epicPractitioner = await epic.readResource('Practitioner', resolveId(gp) as string);
        const npiIdentifier = getIdentifier(epicPractitioner, 'http://hl7.org/fhir/sid/us-npi');
        const medplumPractitioner = await medplum.upsertResource(
          { ...epicPractitioner, id: undefined },
          { identifier: npiIdentifier }
        );
        gp.reference = getReferenceString(medplumPractitioner);
      })
    );
  }

  // Update the patient resource in Medplum with the Epic patient data
  const updatedMedplumPatient = await medplum.updateResource({ ...epicPatient, ...medplumPatient });

  // Create resources that relate to the Patient Profile (e.g. allergies, medications)
  const epicAllergies = await epic.searchResources('AllergyIntolerance', { patient: epicPatientId });
  await Promise.all(
    epicAllergies.map(async (allergyIntolerance) => {
      const code = allergyIntolerance.code?.coding?.[0];
      if (!code) {
        return;
      }
      await medplum.upsertResource(
        { ...allergyIntolerance, id: undefined, patient: createReference(updatedMedplumPatient) },
        {
          patient: getReferenceString(updatedMedplumPatient),
          code: `${code.system}|${code.code}`,
        }
      );
    })
  );

  const epicMedicationRequests = await epic.searchResources('MedicationRequest', { patient: epicPatientId });
  await Promise.all(
    epicMedicationRequests.map(async (medicationRequest) => {
      if (!medicationRequest.medicationReference?.reference) {
        return;
      }

      const epicMedication = await epic.readResource(
        'Medication',
        resolveId(medicationRequest.medicationReference) as string
      );

      const medplumMedication = await medplum.upsertResource(
        { ...epicMedication, id: undefined },
        { identifier: epicMedication.identifier?.[0].value }
      );
      medicationRequest.medicationReference = createReference(medplumMedication);

      if (medicationRequest.requester) {
        const epicRequester = await epic.readResource('Practitioner', resolveId(medicationRequest.requester) as string);
        const npiIdentifier = getIdentifier(epicRequester, 'http://hl7.org/fhir/sid/us-npi');
        const medplumRequester = await medplum.upsertResource(
          { ...epicRequester, id: undefined },
          { identifier: npiIdentifier }
        );
        medicationRequest.requester = createReference(medplumRequester);
      }

      if (medicationRequest.recorder) {
        const epicRecorder = await epic.readResource('Practitioner', resolveId(medicationRequest.recorder) as string);
        const npiIdentifier = getIdentifier(epicRecorder, 'http://hl7.org/fhir/sid/us-npi');
        const medplumRecorder = await medplum.upsertResource(
          { ...epicRecorder, id: undefined },
          { identifier: npiIdentifier }
        );
        medicationRequest.recorder = createReference(medplumRecorder);
      }

      await medplum.upsertResource(
        {
          ...medicationRequest,
          id: undefined,
          encounter: undefined, // To simplify the demo
          subject: createReference(updatedMedplumPatient),
        },
        {
          patient: getReferenceString(updatedMedplumPatient),
          identifier: medicationRequest.identifier?.[0].value,
        }
      );
    })
  );
  return updatedMedplumPatient;
}

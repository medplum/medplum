import { BotEvent, createReference, getIdentifier, getReferenceString, MedplumClient, resolveId } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { createPrivateKey, randomBytes } from 'crypto';
import { SignJWT } from 'jose';
import fetch from 'node-fetch';

export async function handler(medplum: MedplumClient, event: BotEvent<Patient>): Promise<Patient | undefined> {
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

  let medplumPatient = event.input;
  const epicPatientId = getIdentifier(medplumPatient, 'http://open.epic.com/FHIR/StructureDefinition/patient-fhir-id');
  if (!epicPatientId) {
    console.log(`No existing Epic patient found. It will be created.`);
    // Destructure to omit id and meta before creating the resource in Epic
    const { id: _id, meta: _meta, ...patientToCreate } = medplumPatient;
    const epicPatient = await epic.createResource<Patient>(patientToCreate);
    medplumPatient.identifier?.push({
      system: 'http://open.epic.com/FHIR/StructureDefinition/patient-fhir-id',
      value: epicPatient.id,
    });
    medplumPatient = await medplum.updateResource(medplumPatient);
    return medplumPatient;
  }

  const epicPatient = await epic.readResource('Patient', epicPatientId);

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

  medplumPatient = await medplum.upsertResource({ ...epicPatient, id: undefined }, { identifier: epicPatientId });

  // Create resources that relates to the Patient Profile
  const epicAllergies = await epic.searchResources('AllergyIntolerance', { patient: epicPatientId });
  await Promise.all(
    epicAllergies.map(async (allergyIntolerance) => {
      const code = allergyIntolerance.code?.coding?.[0];
      if (!code) {
        return;
      }
      await medplum.upsertResource(
        { ...allergyIntolerance, id: undefined, patient: createReference(medplumPatient) },
        {
          patient: getReferenceString(medplumPatient),
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
          subject: createReference(medplumPatient),
        },
        {
          patient: getReferenceString(medplumPatient),
          identifier: medicationRequest.identifier?.[0].value,
        }
      );
    })
  );
  return medplumPatient;
}

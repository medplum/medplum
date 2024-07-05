import { BotEvent, formatDate, getReferenceString, MedplumClient, PatchOperation } from '@medplum/core';
import { AllergyIntolerance, Identifier, Medication, MedicationRequest, Patient } from '@medplum/fhirtypes';
import fetch from 'node-fetch';

export async function handler(medplum: MedplumClient, event: BotEvent<Patient>): Promise<void> {
  const patient = event.input;

  const PHOTON_KEY = event.secrets['PHOTON_API_KEY']?.valueString as string;

  const allergies = await medplum.searchResources('AllergyIntolerance', {
    patient: getReferenceString(patient),
  });

  const query = `
      mutation createPatient(
        $externalId: ID
        $name: NameInput!
        $dateOfBirth: AWSDate!
        $sex: SexType!
        $phone: AWSPhone!
        $allergies: [AllergenInput]
        $medicationHistory: [MedicationInput]
      ) {
        createPatient(
          externalId: $externalId
          name: $name
          dateOfBirth: $dateOfBirth
          sex: $sex
          phone: $phone
          allergies: $allergies
          medicationHistory: $medicationHistory
        )
      }
    `;

  const variables = {
    externalId: patient.id,
    name: {
      first: patient.name?.[0].given?.[0],
      last: patient.name?.[0].family,
    },
    dateOfBirth: formatDate(patient.birthDate),
    sex: getSexType(patient.gender),
    gender: patient.gender,
    email: getPatientEmail(patient),
    phone: getPatientPhone(patient),
    allergies: formatPatientAllergies(allergies),
    // medicationHistory: getPatientMedicationHistory(),
  };

  const data = JSON.stringify({
    query: `mutation${query}`,
    variables,
  });

  const result = await fetch('https://api.neutron.health/graphql', {
    method: 'POST',
    body: data,
    headers: {
      authorization: 'Basic ' + Buffer.from(`${PHOTON_KEY}:`).toString('base64'),
      'content-type': 'application/json',
    },
  })
    .then((response) => response.json())
    .catch(() => console.log('Error syncing patient'));

  console.log(result);
  await updatePatient(patient, result, medplum);
}

async function updatePatient(patient: Patient, response: any, medplum: MedplumClient): Promise<void> {
  const patientData = response.data.createPatient;
  const photonIdentifier: Identifier = {
    system: 'http://photon.health',
    value: patientData.id,
  };

  const identifiers: Identifier[] = patient.identifier ?? [];
  identifiers.push(photonIdentifier);

  const op = patient.identifier ? 'replace' : 'add';

  const patientId = patient.id as string;
  const ops: PatchOperation[] = [
    // Test to prevent race conditions
    { op: 'test', path: '/meta/versionId', value: patient.meta?.versionId },
    { op, path: '/identifier', value: identifiers },
  ];

  try {
    await medplum.patchResource('Patient', patientId, ops);
    console.log('Success');
  } catch (err) {
    console.error(err);
  }
}

function getSexType(sex: Patient['gender']): 'MALE' | 'FEMALE' | 'UNKNOWN' {
  if (sex === 'other' || sex === 'unknown') {
    return 'UNKNOWN';
  }
  if (sex === 'female') {
    return 'FEMALE';
  }
  return 'MALE';
}

function getPatientEmail(patient: Patient): string | undefined {
  const email = patient.telecom?.find((comm) => comm.system === 'email');
  return email?.value;
}

function getPatientPhone(patient: Patient): string | undefined {
  const phone = patient.telecom?.find((comm) => comm.system === 'phone');
  return phone?.value;
}

function formatPatientAllergies(
  allergies: AllergyIntolerance[]
): { onset?: string; allergen: { id?: string; name?: string; rxcui?: string } }[] {
  const patientAllergies = [];
  for (const allergy of allergies) {
    const onset = formatDate(allergy.onsetDateTime);
    const allergen = allergy.code?.coding?.find(
      (code) => code.system === 'http://www.nlm.nih.gov/research/umls/rxnorm'
    );
    patientAllergies.push({
      onset,
      allergen: {
        id: allergy.code?.id,
        name: allergen?.display,
        rxcui: allergen?.code,
      },
    });
  }

  return patientAllergies;
}

async function formatPatientMedicationHistory(patient: Patient, medplum: MedplumClient) {
  const medicationHistory = [];
  const medicationList = await medplum.searchOne('List', {
    patient: getReferenceString(patient),
    code: '10160-0',
  });

  const medicationEntries = medicationList?.entry;
  if (!medicationEntries) {
    return undefined;
  }

  for (const entry of medicationEntries) {
    const medication = (await medplum.readReference(entry.item)) as MedicationRequest;
    const medicationCode = medication.medicationCodeableConcept?.coding?.find(
      (code) => code.system === 'http://www.nlm.nih.gov/research/umls/rxnorm'
    );
    const photonMedication = {
      id: medication.id,
      name: medicationCode?.display,
      codes: {
        rxcui: medicationCode?.code,
      },
    };
  }
}

import { allOk, BotEvent, getReferenceString, MedplumClient, PatchOperation } from '@medplum/core';
import {
  AllergyIntolerance,
  ContactPoint,
  Identifier,
  OperationOutcome,
  Patient,
  Practitioner,
} from '@medplum/fhirtypes';
import fetch from 'node-fetch';

export async function handler(medplum: MedplumClient, event: BotEvent<Patient>): Promise<OperationOutcome> {
  const patient = event.input;

  const PHOTON_KEY = process.env.PHOTON_AUTH_TOKEN as string;
  console.log(PHOTON_KEY);

  const allergies = await medplum.searchResources('AllergyIntolerance', {
    patient: getReferenceString(patient),
  });

  const photonQuery = `
      mutation createPatient(
        $externalId: ID
        $name: NameInput!
        $dateOfBirth: AWSDate!
        $sex: SexType!
        $gender: String
        $email: AWSEmail
        $phone: AWSPhone!
        $allergies: [AllergenInput]
        $medicationHistory: [MedHistoryInput]
        $address: AddressInput
      ) {
        createPatient(
          externalId: $externalId
          name: $name
          dateOfBirth: $dateOfBirth
          sex: $sex
          gender: $gender
          email: $email
          phone: $phone
          allergies: $allergies
          medicationHistory: $medicationHistory
          address: $address
        ) {
          id
        }
      }
    `;

  const variables = {
    externalId: patient.id,
    name: {
      first: patient.name?.[0].given?.[0],
      last: patient.name?.[0].family,
    },
    dateOfBirth: formatAWSDate(patient.birthDate),
    sex: getSexType(patient.gender),
    gender: patient.gender,
    email: getTelecom('email', patient),
    phone: getTelecom('phone', patient),
    allergies: formatPatientAllergies(allergies),
    medicationHistory: await formatPatientMedicationHistory(patient, medplum),
  };

  const data = JSON.stringify({
    query: photonQuery,
    variables,
  });

  console.log(data);

  const result: any = await fetch('https://api.neutron.health/graphql', {
    method: 'POST',
    body: data,
    headers: {
      authorization: `Bearer ${PHOTON_KEY}`,
      'content-type': 'application/json',
    },
  })
    .then((response) => response.json())
    .catch(() => console.log('Error syncing patient'));

  console.log(result);
  await updatePatient(patient, result, medplum);
  return allOk;
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

function formatPatientAllergies(
  allergies: AllergyIntolerance[]
): { allergenId?: string; onset?: string; comment?: string }[] {
  const patientAllergies = [];
  for (const allergy of allergies) {
    const onset = formatAWSDate(allergy.onsetDateTime);
    patientAllergies.push({
      onset,
      allergenId: allergy.id,
    });
  }

  return patientAllergies;
}

async function formatPatientMedicationHistory(patient: Patient, medplum: MedplumClient): Promise<any> {
  const medicationHistory = [];
  const medicationRequests = await medplum.searchResources('MedicationRequest', {
    patient: getReferenceString(patient),
  });

  if (!medicationRequests) {
    return undefined;
  }

  for (const medication of medicationRequests) {
    medicationHistory.push({
      medicationId: medication.id as string,
      active: medication.status === 'active',
      comment: medication.note?.[0].text,
    });
  }

  return medicationHistory;
}

function getTelecom(system: ContactPoint['system'], person?: Practitioner | Patient): string | undefined {
  if (!person) {
    return undefined;
  }

  const telecom = person.telecom?.find((comm) => comm.system === system);

  if (system === 'phone' && telecom?.value) {
    return '+1' + telecom.value;
  } else {
    return telecom?.value;
  }
}

function formatAWSDate(date?: string) {
  if (!date) {
    return '';
  }

  const dateString = new Date(date);
  return dateString.toISOString().slice(0, 10);
}

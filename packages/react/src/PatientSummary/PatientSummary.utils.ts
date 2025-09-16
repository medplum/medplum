// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { capitalize, getExtension, HTTP_HL7_ORG } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';

export function getGenderIdentity(patient: Patient): string | undefined {
  const genderIdentityExt = getExtension(
    patient,
    `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-genderIdentity`
  );
  return genderIdentityExt?.valueCodeableConcept?.coding?.[0]?.display;
}

export function getBirthSex(patient: Patient): string | undefined {
  const birthSexExt = getExtension(patient, `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-birthsex`);
  return birthSexExt?.valueCode;
}

export function getRace(patient: Patient): string | undefined {
  const raceExt = getExtension(patient, `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`);
  return raceExt?.extension?.find((subExt) => subExt.url === 'ombCategory')?.valueCoding?.display;
}

export function getEthnicity(patient: Patient): string | undefined {
  const ethnicityExt = getExtension(patient, `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-ethnicity`);
  return ethnicityExt?.extension?.find((subExt) => subExt.url === 'ombCategory')?.valueCoding?.display;
}

export function getGeneralPractitioner(patient: Patient): string | undefined {
  return patient.generalPractitioner?.[0]?.display;
}

export function formatPatientGenderDisplay(patient: Patient): string {
  const capitalizedGender = patient.gender ? capitalize(patient.gender) : '';

  const genderIdentity = getGenderIdentity(patient);
  const birthSex = getBirthSex(patient);

  const parts: string[] = [];

  if (capitalizedGender) {
    parts.push(capitalizedGender);
  }

  if (genderIdentity) {
    parts.push(genderIdentity);
  }

  if (birthSex) {
    parts.push(`Born as ${birthSex}`);
  }

  return parts.join(' · ');
}

export function formatPatientRaceEthnicityDisplay(patient: Patient): string {
  const race = getRace(patient);
  const ethnicity = getEthnicity(patient);
  const parts: string[] = [];

  if (race) {
    parts.push(race);
  }
  if (ethnicity) {
    parts.push(ethnicity);
  }

  return parts.join(' · ');
}

export const getPreferredLanguage = (patient: Patient): string | undefined => {
  if (!patient.communication?.length) {
    return undefined;
  }

  const preferred = patient.communication?.find((comm) => comm.preferred === true);
  if (preferred?.language?.coding?.[0]?.display) {
    return preferred.language.coding[0].display;
  }

  return patient.communication[0]?.language?.coding?.[0]?.display;
};

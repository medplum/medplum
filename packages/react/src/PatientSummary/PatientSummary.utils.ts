import { calculateAgeString, HTTP_HL7_ORG } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';

export function getGenderIdentity(patient: Patient): string | undefined {
  const genderIdentityExt = patient.extension?.find(
    (ext) => ext.url === `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-genderIdentity`
  );
  return genderIdentityExt?.valueCodeableConcept?.coding?.[0]?.display;
}

export function getBirthSex(patient: Patient): string | undefined {
  const birthSexExt = patient.extension?.find(
    (ext) => ext.url === `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-birthsex`
  );
  return birthSexExt?.valueCode;
}

export function getRace(patient: Patient): string | undefined {
  const raceExt = patient.extension?.find(
    (ext) => ext.url === `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`
  );
  return raceExt?.extension?.find((subExt) => subExt.url === 'ombCategory')?.valueCoding?.display;
}

export function getEthnicity(patient: Patient): string | undefined {
  const ethnicityExt = patient.extension?.find(
    (ext) => ext.url === `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-ethnicity`
  );
  return ethnicityExt?.extension?.find((subExt) => subExt.url === 'ombCategory')?.valueCoding?.display;
}

export function getGeneralPractitioner(patient: Patient): string | undefined {
  return patient.generalPractitioner?.[0]?.display;
}

export function getPatientAgeDisplay(birthDate: string): string {
  const ageStr = calculateAgeString(birthDate);
  if (!ageStr) {
    return '0 years old';
  }

  const age = parseInt(ageStr, 10);
  return `${isNaN(age) ? '0' : age} years old`;
}

export function formatPatientGenderDisplay(patient: Patient): string {
  const capitalizedGender = patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : '';

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

export function formatPatientAddressDisplay(patient: Patient): string {
  const city = patient.address?.[0]?.city || '';
  const state = patient.address?.[0]?.state || '';

  const parts: string[] = [];

  if (city) {
    parts.push(city);
  }

  if (state) {
    parts.push(state);
  }

  return parts.join(', ');
}

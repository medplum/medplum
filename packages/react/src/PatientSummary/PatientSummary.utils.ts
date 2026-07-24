// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { capitalize, getExtension, HTTP_HL7_ORG } from '@medplum/core';
import type { CodeableConcept, Patient, Resource } from '@medplum/fhirtypes';

/**
 * Returns true when a resource has been marked `entered-in-error`. Such resources are hidden from
 * list/summary views (they remain accessible by direct URL). The error state lives in different
 * fields depending on resource type: `.status` (most), `.lifecycleStatus` (Goal), and
 * `.verificationStatus` (AllergyIntolerance, Condition).
 * @param resource - The resource to check.
 * @returns True if the resource is entered-in-error.
 */
export function isEnteredInError(resource: Resource): boolean {
  const candidate = resource as Resource & {
    status?: string;
    lifecycleStatus?: string;
    verificationStatus?: CodeableConcept;
  };
  if (candidate.status === 'entered-in-error' || candidate.lifecycleStatus === 'entered-in-error') {
    return true;
  }
  return !!candidate.verificationStatus?.coding?.some((coding) => coding.code === 'entered-in-error');
}

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

/**
 * Formats a FHIR status/lifecycleStatus code for display: removes hyphens and capitalizes each word.
 * e.g. 'on-hold' → 'On Hold', 'not-done' → 'Not Done', 'active' → 'Active'.
 * @param status - The raw status code.
 * @returns The human-friendly, capitalized, hyphen-free label.
 */
export function formatStatusLabel(status: string): string {
  return status
    .split('-')
    .map((word) => capitalize(word))
    .join(' ');
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

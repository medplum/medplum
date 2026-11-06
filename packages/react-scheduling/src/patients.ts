// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getIdentifier, getIdentifierByType, MRN_IDENTIFIER_TYPE } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';

/**
 * Reads a patient's medical record number.
 *
 * A typed identifier answers it whoever issued it, which is the case that needs
 * no configuration. `mrnSystem` is for the project whose identifiers carry no
 * type, where nothing but the system says which one this is.
 *
 * @param patient - The patient to read.
 * @param mrnSystem - The system a project issues medical record numbers under.
 * @returns The medical record number, or undefined for a patient with none.
 */
export function getMedicalRecordNumber(patient: Patient, mrnSystem: string | undefined): string | undefined {
  return (
    getIdentifierByType(patient, MRN_IDENTIFIER_TYPE) ?? (mrnSystem ? getIdentifier(patient, mrnSystem) : undefined)
  );
}

/**
 * Tells whether a patient holds a medical record number.
 *
 * Where {@link getMedicalRecordNumber} reads one, this checks them all: a
 * patient can hold more than one, from more than one issuer.
 *
 * @param patient - The patient to check.
 * @param mrnSystem - The system a project issues medical record numbers under.
 * @param mrn - The number to look for.
 * @returns True when one of the patient's medical record numbers is `mrn`.
 */
export function hasMedicalRecordNumber(patient: Patient, mrnSystem: string | undefined, mrn: string): boolean {
  return (patient.identifier ?? []).some(
    (identifier) =>
      identifier.value === mrn &&
      ((mrnSystem !== undefined && identifier.system === mrnSystem) ||
        identifier.type?.coding?.some(
          (coding) => coding.system === MRN_IDENTIFIER_TYPE.system && coding.code === MRN_IDENTIFIER_TYPE.code
        ) === true)
  );
}

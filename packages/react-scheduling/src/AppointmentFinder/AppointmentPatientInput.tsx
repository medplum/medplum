// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { formatDate, getIdentifier, getIdentifierByType, MRN_IDENTIFIER_TYPE } from '@medplum/core';
import type { Patient, Reference } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { ResourceInput } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback } from 'react';
import { AppointmentOptionRow } from './AppointmentOptionRow';

// Alphabetical, then by birth date: a short prefix — or the first click, before
// anything is typed — leaves a list only a name orders usefully, and the birth
// date is what tells the people sharing one apart.
const PATIENT_SEARCH_CRITERIA = { _count: '25', _sort: 'name,birthdate' };

export interface AppointmentPatientInputProps {
  /** Read once, at mount. */
  readonly defaultValue?: WithId<Patient> | Reference<Patient>;
  /** See {@link AppointmentProposalFormProps.mrnSystem}. */
  readonly mrnSystem?: string;
  readonly onChange: (patient: WithId<Patient> | undefined) => void;
}

/**
 * Asks who a visit is for, telling namesakes apart by birth date and medical record number.
 * @param props - The React props.
 * @returns The field.
 */
export function AppointmentPatientInput(props: AppointmentPatientInputProps): JSX.Element {
  const { defaultValue, mrnSystem, onChange } = props;

  const patientItem = useCallback(
    (option: AsyncAutocompleteOption<WithId<Patient>>) => (
      <AppointmentOptionRow label={option.label} detail={formatPatientDetail(option.resource, mrnSystem)} />
    ),
    [mrnSystem]
  );

  return (
    <ResourceInput<WithId<Patient>>
      resourceType="Patient"
      name="patient"
      label="Patient"
      placeholder="Search patients by name"
      required
      searchCriteria={PATIENT_SEARCH_CRITERIA}
      defaultValue={defaultValue as WithId<Patient> | Reference<WithId<Patient>> | undefined}
      itemComponent={patientItem}
      onChange={onChange}
      clearable={false}
    />
  );
}

/**
 * What tells one patient apart from another of the same name.
 * @param patient - The patient on offer.
 * @param mrnSystem - The system a project issues medical record numbers under.
 * @returns The line under their name, or undefined when nothing is on file.
 */
function formatPatientDetail(patient: WithId<Patient>, mrnSystem: string | undefined): string | undefined {
  const mrn = getMedicalRecordNumber(patient, mrnSystem);
  return [formatDate(patient.birthDate), mrn && `MRN ${mrn}`].filter(Boolean).join(' · ') || undefined;
}

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
function getMedicalRecordNumber(patient: WithId<Patient>, mrnSystem: string | undefined): string | undefined {
  return (
    getIdentifierByType(patient, MRN_IDENTIFIER_TYPE) ?? (mrnSystem ? getIdentifier(patient, mrnSystem) : undefined)
  );
}

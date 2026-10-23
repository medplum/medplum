// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { formatDate, getDisplayString, getReferenceString, isReference } from '@medplum/core';
import type { OperationOutcome, Patient, Reference } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { AsyncAutocomplete } from '@medplum/react';
import { useMedplum, useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { getMedicalRecordNumber, hasMedicalRecordNumber } from '../patients';
import { AppointmentOptionRow } from './AppointmentOptionRow';

// Alphabetical, then by birth date: a short prefix — or the first click, before
// anything is typed — leaves a list only a name orders usefully, and the birth
// date is what tells the people sharing one apart.
const NAME_SEARCH_CRITERIA = { _count: '25', _sort: 'name,birthdate' };

// An MRN names one patient; a few more leaves room for identifiers from other
// systems that share the value and are filtered out below.
const IDENTIFIER_SEARCH_CRITERIA = { _count: '10' };

export interface AppointmentPatientInputProps {
  /** Read once, at mount. */
  readonly defaultValue?: WithId<Patient> | Reference<Patient>;
  /** See {@link AppointmentProposalFormProps.mrnSystem}. */
  readonly mrnSystem?: string;
  readonly required?: boolean;
  readonly error?: string;
  readonly onChange: (patient: WithId<Patient> | undefined) => void;
}

/**
 * Asks who a visit is for, found by name or medical record number, telling
 * namesakes apart by birth date and medical record number.
 * @param props - The React props.
 * @returns The field.
 */
export function AppointmentPatientInput(props: AppointmentPatientInputProps): JSX.Element | null {
  const { mrnSystem, required, onChange, error } = props;
  const medplum = useMedplum();

  const [initialValue] = useState(props.defaultValue);
  const [defaultOutcome, setDefaultOutcome] = useState<OperationOutcome>();
  const defaultPatient = useResource(initialValue, setDefaultOutcome);

  const loadPatients = useCallback(
    async (input: string, signal: AbortSignal): Promise<WithId<Patient>[]> => {
      const mrn = input.trim();
      const [byIdentifier, byName] = await Promise.all([
        mrn
          ? medplum
              .searchResources('Patient', { identifier: mrn, ...IDENTIFIER_SEARCH_CRITERIA }, { signal })
              // Losing the number search still leaves the name search to answer.
              .catch(() => [])
          : [],
        medplum.searchResources('Patient', { name: input, ...NAME_SEARCH_CRITERIA }, { signal }),
      ]);

      // `identifier` matches every system, and a number typed may be somebody's
      // insurance member ID. Only a medical record number counts as a match.
      const byMrn = byIdentifier.filter((patient) => hasMedicalRecordNumber(patient, mrnSystem, mrn));

      // An exact number is the surer match, so it leads.
      const mrnIds = new Set(byMrn.map((patient) => patient.id));
      return [...byMrn, ...byName.filter((patient) => !mrnIds.has(patient.id))];
    },
    [medplum, mrnSystem]
  );

  const patientItem = useCallback(
    (option: AsyncAutocompleteOption<WithId<Patient>>) => (
      <AppointmentOptionRow label={option.label} detail={formatPatientDetail(option.resource, mrnSystem)} />
    ),
    [mrnSystem]
  );

  const handleChange = useCallback((patients: WithId<Patient>[]) => onChange(patients[0]), [onChange]);

  if (isReference(initialValue) && !defaultPatient && !defaultOutcome) {
    // AsyncAutocomplete reads its default selection once, so wait for the reference to resolve.
    return null;
  }

  return (
    <AsyncAutocomplete<WithId<Patient>>
      name="patient"
      label="Patient"
      placeholder="Search patients by name or MRN"
      required={required}
      error={error}
      defaultValue={defaultPatient}
      toOption={toPatientOption}
      loadOptions={loadPatients}
      itemComponent={patientItem}
      onChange={handleChange}
      maxValues={1}
      clearable={false}
    />
  );
}

function toPatientOption(patient: WithId<Patient>): AsyncAutocompleteOption<WithId<Patient>> {
  return { value: getReferenceString(patient), label: getDisplayString(patient), resource: patient };
}

/**
 * What tells one patient apart from another of the same name.
 * @param patient - The patient on offer.
 * @param mrnSystem - The system a project issues medical record numbers under.
 * @returns The line under their name, or undefined when nothing is on file.
 */
function formatPatientDetail(patient: Patient, mrnSystem: string | undefined): string | undefined {
  const mrn = getMedicalRecordNumber(patient, mrnSystem);
  return [formatDate(patient.birthDate), mrn && `MRN ${mrn}`].filter(Boolean).join(' · ') || undefined;
}

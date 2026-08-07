// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { formatDate, getIdentifier } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { MultiResourceInput } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useMemo } from 'react';

/**
 * How many patients one search offers, and the order they come back in.
 */
const PATIENT_SEARCH_CRITERIA = { _count: '20', _sort: 'birthdate' };

/**
 * The v2-0203 code marking an identifier as a medical record number.
 */
const MRN_TYPE_CODE = 'MR';

export interface AppointmentPatientSelectProps {
  readonly patient: WithId<Patient> | undefined;
  readonly onChange: (patient: WithId<Patient> | undefined) => void;
  readonly label?: string;
  readonly error?: string;
  readonly disabled?: boolean;
  readonly mrnSystem?: string;
}

/**
 * Chooses the patient an appointment is for.
 * @param props - The React props.
 * @returns The patient field.
 */
export function AppointmentPatientSelect(props: AppointmentPatientSelectProps): JSX.Element {
  const { patient, onChange, label = 'Patient', error, disabled, mrnSystem } = props;

  const handleChange = useCallback((patients: WithId<Patient>[]) => onChange(patients[0]), [onChange]);

  const itemComponent = useMemo(
    () =>
      function PatientOption(option: Readonly<AsyncAutocompleteOption<WithId<Patient>>>): JSX.Element {
        return <PatientItem option={option} mrnSystem={mrnSystem} />;
      },
    [mrnSystem]
  );

  return (
    <MultiResourceInput<WithId<Patient>>
      resourceType="Patient"
      name="patient"
      label={label}
      placeholder="Search by name"
      required
      maxValues={1}
      error={error}
      disabled={disabled}
      defaultValue={patient ? [patient] : undefined}
      searchCriteria={PATIENT_SEARCH_CRITERIA}
      itemComponent={itemComponent}
      onChange={handleChange}
    />
  );
}

/**
 * One patient in the list, named and identified.
 * @param props - The React props.
 * @param props.option - The option to render.
 * @param props.mrnSystem - The system MRNs are issued under, when they are not typed.
 * @returns The row.
 */
function PatientItem(props: {
  readonly option: Readonly<AsyncAutocompleteOption<WithId<Patient>>>;
  readonly mrnSystem: string | undefined;
}): JSX.Element {
  const { option, mrnSystem } = props;
  const { resource } = option;
  const mrn = getMrn(resource, mrnSystem);
  const details = [resource.birthDate && `Born ${formatDate(resource.birthDate)}`, mrn && `MRN ${mrn}`].filter(Boolean);

  return (
    <Group justify="space-between" gap="sm" wrap="nowrap">
      <Stack gap={0}>
        <Text size="sm">{option.label}</Text>
        {details.length > 0 && (
          <Text size="xs" c="dimmed">
            {details.join(' · ')}
          </Text>
        )}
      </Stack>
    </Group>
  );
}

/**
 * Reads a patient's medical record number.
 * @param patient - The patient to read.
 * @param system - The system MRNs are issued under, for a project that does not type them.
 * @returns The MRN, or undefined when the patient carries nothing that says it is one.
 */
function getMrn(patient: Patient, system: string | undefined): string | undefined {
  if (system) {
    return getIdentifier(patient, system);
  }
  return patient.identifier?.find((identifier) =>
    identifier.type?.coding?.some((coding) => coding.code === MRN_TYPE_CODE)
  )?.value;
}

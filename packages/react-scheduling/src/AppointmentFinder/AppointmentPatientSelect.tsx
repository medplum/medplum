// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { formatDate, getDisplayString, getIdentifier, getReferenceString } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { AsyncAutocomplete } from '@medplum/react';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useMemo } from 'react';

/** How many patients one search offers. */
const PATIENT_COUNT = 20;

/**
 * The v2-0203 code marking an identifier as a medical record number.
 *
 * A patient carries identifiers for all sorts of things — an insurance member
 * number, a driver's licence — so the MRN is picked out by what it says it is.
 * Taking the first identifier instead would put whatever happens to be first on
 * screen, which for some records is a number nobody should be reading out.
 */
const MRN_TYPE_CODE = 'MR';

export interface AppointmentPatientSelectProps {
  readonly patient: WithId<Patient> | undefined;
  readonly onChange: (patient: WithId<Patient> | undefined) => void;
  readonly label?: string;
  readonly error?: string;
  readonly disabled?: boolean;
  /**
   * The `Identifier.system` MRNs are issued under, for a project that does not
   * type them. Left out, an identifier typed `MR` is the MRN and a patient
   * without one is listed by name and birth date alone.
   */
  readonly mrnSystem?: string;
}

/**
 * Chooses the patient an appointment is for.
 *
 * Searches by name, and offers each match with their date of birth and medical
 * record number: a practice of any size has two people called the same thing,
 * and these are the two things the person booking has to hand — a birth date to
 * check against the caller, an MRN to check against whatever else is open on the
 * desk.
 *
 * Matches are listed oldest first, which decides not only their order but which
 * of them are offered: a name shared by more people than one page holds is
 * answered with the oldest of them, and a younger patient of that name has to be
 * narrowed down to.
 *
 * @param props - The React props.
 * @returns The patient field.
 */
export function AppointmentPatientSelect(props: AppointmentPatientSelectProps): JSX.Element {
  const { patient, onChange, label = 'Patient', error, disabled, mrnSystem } = props;
  const medplum = useMedplum();

  const loadPatients = useCallback(
    async (input: string, signal: AbortSignal): Promise<WithId<Patient>[]> => {
      const searchParams = new URLSearchParams({
        name: input,
        _count: PATIENT_COUNT.toString(),
        // Ascending, so the earliest birth date — the oldest patient — leads.
        _sort: 'birthdate',
      });
      return medplum.searchResources('Patient', searchParams, { signal });
    },
    [medplum]
  );

  const handleChange = useCallback((patients: WithId<Patient>[]) => onChange(patients[0]), [onChange]);

  const itemComponent = useMemo(
    () =>
      function PatientOption(option: Readonly<AsyncAutocompleteOption<WithId<Patient>>>): JSX.Element {
        return <PatientItem option={option} mrnSystem={mrnSystem} />;
      },
    [mrnSystem]
  );

  return (
    <AsyncAutocomplete<WithId<Patient>>
      name="patient"
      label={label}
      placeholder="Search by name"
      required
      clearable
      maxValues={1}
      error={error}
      disabled={disabled}
      defaultValue={patient ? [patient] : undefined}
      toOption={toPatientOption}
      loadOptions={loadPatients}
      itemComponent={itemComponent}
      onChange={handleChange}
    />
  );
}

function toPatientOption(patient: WithId<Patient>): AsyncAutocompleteOption<WithId<Patient>> {
  return {
    value: getReferenceString(patient),
    label: getDisplayString(patient),
    resource: patient,
  };
}

/**
 * One patient in the list, named and identified.
 *
 * Both identifying details sit on one line under the name, so that scanning the
 * list is reading down a single column rather than across two.
 *
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

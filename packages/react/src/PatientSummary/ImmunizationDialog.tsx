// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Radio, Stack } from '@mantine/core';
import { createReference } from '@medplum/core';
import type { Encounter, Immunization, Patient } from '@medplum/fhirtypes';
import { IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { CodeableConceptInput } from '../CodeableConceptInput/CodeableConceptInput';
import { DateTimeInput } from '../DateTimeInput/DateTimeInput';
import { convertLocalToIso } from '../DateTimeInput/DateTimeInput.utils';
import { SubmitButton } from '../Form/SubmitButton';
import { MedplumModal } from '../MedplumModal/MedplumModal';
import { formatStatusLabel } from './PatientSummary.utils';

export interface ImmunizationDialogProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly immunization?: Immunization;
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (immunization: Immunization) => void;
  /** When editing an existing immunization, called to delete it. */
  readonly onDelete?: () => void;
}

const statusValues: Immunization['status'][] = ['completed', 'not-done'];

export function ImmunizationDialog(props: ImmunizationDialogProps): JSX.Element {
  const { patient, encounter, immunization, opened, onClose, onSubmit, onDelete } = props;
  const [vaccineCode, setVaccineCode] = useState(immunization?.vaccineCode);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      onSubmit({
        ...immunization,
        resourceType: 'Immunization',
        status: (formData.status as Immunization['status']) ?? 'completed',
        patient: createReference(patient),
        encounter: immunization?.encounter ?? (encounter && createReference(encounter)),
        vaccineCode: vaccineCode ?? { text: '' },
        occurrenceDateTime: formData.occurrenceDateTime
          ? convertLocalToIso(formData.occurrenceDateTime)
          : (immunization?.occurrenceDateTime ?? ''),
      });
    },
    [patient, encounter, immunization, vaccineCode, onSubmit]
  );

  return (
    <MedplumModal
      opened={opened}
      onClose={onClose}
      title={immunization ? 'Edit Immunization' : 'Add Immunization'}
      size="md"
      onSubmit={handleSubmit}
      actions={
        <>
          <SubmitButton>Save</SubmitButton>
          {immunization?.id && onDelete && (
            <Button variant="light" color="red" leftSection={<IconTrash size={16} />} onClick={onDelete}>
              Delete
            </Button>
          )}
        </>
      }
    >
      <Stack gap="md">
        <CodeableConceptInput
          name="vaccineCode"
          label="Vaccine"
          path="Immunization.vaccineCode"
          data-autofocus={true}
          binding="http://hl7.org/fhir/ValueSet/vaccine-code"
          maxValues={1}
          defaultValue={immunization?.vaccineCode}
          onChange={(value) => setVaccineCode(value)}
          outcome={undefined}
        />
        <DateTimeInput
          name="occurrenceDateTime"
          label="Date Given"
          defaultValue={immunization?.occurrenceDateTime}
          required
        />
        <Radio.Group name="status" label="Status" required defaultValue={immunization?.status ?? 'completed'}>
          {statusValues.map((sv) => (
            <Radio key={sv} value={sv} label={formatStatusLabel(sv as string)} my="xs" required />
          ))}
        </Radio.Group>
      </Stack>
    </MedplumModal>
  );
}

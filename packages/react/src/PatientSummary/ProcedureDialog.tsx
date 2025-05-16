import { Group, Stack, Radio } from '@mantine/core';
import { HTTP_HL7_ORG, addProfileToResource, createReference } from '@medplum/core';
import { CodeableConcept, Procedure, Encounter, Patient } from '@medplum/fhirtypes';
import { useCallback, useState, JSX } from 'react';
import { CodeableConceptInput } from '../CodeableConceptInput/CodeableConceptInput';
import { DateTimeInput } from '../DateTimeInput/DateTimeInput';
import { convertLocalToIso } from '../DateTimeInput/DateTimeInput.utils';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';

export interface ProcedureDialogProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly procedure?: Procedure;
  readonly onSubmit: (procedure: Procedure) => void;
}

const statusValues: Procedure['status'][] = [
  'preparation',
  'in-progress',
  'not-done',
  'on-hold',
  'stopped',
  'completed',
  'entered-in-error',
  'unknown',
];

export function ProcedureDialog(props: ProcedureDialogProps): JSX.Element {
  const { patient, encounter, procedure, onSubmit } = props;
  const [code, setCode] = useState<CodeableConcept | undefined>(procedure?.code);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      onSubmit(
        addProfileToResource(
          {
            ...procedure,
            resourceType: 'Procedure',
            subject: createReference(patient),
            encounter: encounter && createReference(encounter),
            code,
            status: formData.status as Procedure['status'],
            performedDateTime: formData.performedDateTime ? convertLocalToIso(formData.performedDateTime) : undefined,
          },
          HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-procedure'
        )
      );
    },
    [patient, encounter, procedure, code, onSubmit]
  );

  return (
    <Form onSubmit={handleSubmit}>
      <Stack>
        <CodeableConceptInput
          name="code"
          label="Procedure"
          path="Procedure.code"
          data-autofocus={true}
          binding={HTTP_HL7_ORG + '/fhir/us/core/ValueSet/us-core-procedure-code'}
          defaultValue={procedure?.code}
          onChange={(code) => setCode(code)}
          outcome={undefined}
        />
        <Radio.Group name="status" label="Status" required defaultValue={procedure?.status}>
          {statusValues.map((sv) => (
            <Radio key={sv} value={sv} label={sv} my="xs" required />
          ))}
        </Radio.Group>
        <DateTimeInput name="performedDateTime" label="Date Performed" defaultValue={procedure?.performedDateTime} required />
        <Group justify="flex-end" gap={4}>
          <SubmitButton>Save</SubmitButton>
        </Group>
      </Stack>
    </Form>
  );
} 
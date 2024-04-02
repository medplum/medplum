import { Button, Group, Stack } from '@mantine/core';
import { createReference } from '@medplum/core';
import { CodeableConcept, Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { useCallback, useState } from 'react';
import { CodeableConceptInput } from '../CodeableConceptInput/CodeableConceptInput';
import { DateTimeInput } from '../DateTimeInput/DateTimeInput';
import { Form } from '../Form/Form';

export interface ConditionDialogProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly condition?: Condition;
  readonly onSubmit: (condition: Condition) => void;
}

export function ConditionDialog(props: ConditionDialogProps): JSX.Element {
  const { patient, encounter, condition, onSubmit } = props;
  const [code, setCode] = useState<CodeableConcept | undefined>(condition?.code);
  const [clinicalStatus, setClinicalStatus] = useState<CodeableConcept | undefined>(condition?.clinicalStatus);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      onSubmit({
        ...condition,
        resourceType: 'Condition',
        subject: createReference(patient),
        encounter: encounter ? createReference(encounter) : undefined,
        code,
        clinicalStatus,
        onsetDateTime: formData.onsetDateTime ? formData.onsetDateTime : undefined,
      });
    },
    [patient, encounter, condition, code, clinicalStatus, onSubmit]
  );

  return (
    <Form key={condition?.id} onSubmit={handleSubmit}>
      <Stack>
        <CodeableConceptInput
          name="code"
          label="Problem"
          path="Condition.code"
          data-autofocus={true}
          binding="http://hl7.org/fhir/ValueSet/condition-code"
          defaultValue={condition?.code}
          onChange={(code) => setCode(code)}
          outcome={undefined}
        />
        <CodeableConceptInput
          name="clinicalStatus"
          label="Status"
          path="Condition.clinicalStatus"
          binding="http://hl7.org/fhir/ValueSet/Condition-clinical"
          defaultValue={condition?.clinicalStatus}
          onChange={(clinicalStatus) => setClinicalStatus(clinicalStatus)}
          outcome={undefined}
        />
        <DateTimeInput name="onsetDateTime" label="Dx Date" defaultValue={condition?.onsetDateTime} required />
        <Group justify="flex-end" gap={4} mt="md">
          <Button type="submit">Save</Button>
        </Group>
      </Stack>
    </Form>
  );
}

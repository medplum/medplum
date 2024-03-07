import { Button, Group, Radio, Stack } from '@mantine/core';
import { createReference } from '@medplum/core';
import { CodeableConcept, Encounter, MedicationRequest, Patient } from '@medplum/fhirtypes';
import { useCallback, useState } from 'react';
import { CodeableConceptInput } from '../CodeableConceptInput/CodeableConceptInput';
import { Form } from '../Form/Form';

export interface MedicationDialogProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly medication?: MedicationRequest;
  readonly onSubmit: (medication: MedicationRequest) => void;
}

export function MedicationDialog(props: MedicationDialogProps): JSX.Element {
  const { patient, encounter, medication, onSubmit } = props;
  const [code, setCode] = useState<CodeableConcept>();

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      const status = formData.status as 'active' | 'stopped';
      onSubmit({
        ...medication,
        resourceType: 'MedicationRequest',
        status,
        intent: 'order',
        encounter: encounter ? createReference(encounter) : undefined,
        medicationCodeableConcept: code,
        subject: createReference(patient),
      });
    },
    [patient, encounter, medication, code, onSubmit]
  );

  return (
    <Form onSubmit={handleSubmit}>
      <Stack h={275}>
        <CodeableConceptInput
          name="request"
          path="MedicationRequest.medication[x]"
          data-autofocus={true}
          binding="https://app.medplum.com/ValueSet/16d6f7b7-7eeb-4d0e-a83b-83be082aa10b"
          defaultValue={medication?.medicationCodeableConcept}
          onChange={(request) => setCode(request)}
          outcome={undefined}
        />
        <Radio.Group mt={32} name="status" label="Request Status" required>
          <Radio key="active" value="active" label="active" my="xs" />
          <Radio key="stopped" value="stopped" label="stopped" my="xs" />
        </Radio.Group>
        <Group justify="flex-end" gap={4} mt="md">
          <Button type="submit">Save</Button>
        </Group>
      </Stack>
    </Form>
  );
}

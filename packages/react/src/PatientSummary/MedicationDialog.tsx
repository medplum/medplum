import { Alert, Button, Group, Radio, Stack } from '@mantine/core';
import { HTTP_HL7_ORG, addProfileToResource, createReference } from '@medplum/core';
import { CodeableConcept, Encounter, MedicationRequest, Patient } from '@medplum/fhirtypes';
import { useCallback, useState } from 'react';
import { CodeableConceptInput } from '../CodeableConceptInput/CodeableConceptInput';
import { Form } from '../Form/Form';
import { useMedplumProfile } from '@medplum/react-hooks';

export interface MedicationDialogProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly medication?: MedicationRequest;
  readonly onSubmit: (medication: MedicationRequest) => void;
}

const HTTP = 'http://';

const statusValues: MedicationRequest['status'][] = [
  'active',
  'stopped',
  'on-hold',
  'cancelled',
  'completed',
  'entered-in-error',
  'draft',
  'unknown',
];

export function MedicationDialog(props: MedicationDialogProps): JSX.Element {
  const me = useMedplumProfile();
  const { patient, encounter, medication, onSubmit } = props;
  const [code, setCode] = useState<CodeableConcept | undefined>(medication?.medicationCodeableConcept);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      if (!me) {
        throw new Error('Not signed in');
      }

      onSubmit(
        addProfileToResource(
          {
            ...medication,
            resourceType: 'MedicationRequest',
            status: formData.status as MedicationRequest['status'],
            intent: medication?.intent ?? 'order',
            encounter: medication?.encounter ?? (encounter && createReference(encounter)),
            requester: medication?.requester ?? createReference(me),
            medicationCodeableConcept: code,
            subject: createReference(patient),
          },
          HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-medicationrequest'
        )
      );
    },
    [me, onSubmit, medication, encounter, code, patient]
  );

  if (!me) {
    return <Alert color="red">Not signed in</Alert>;
  }

  return (
    <Form onSubmit={handleSubmit}>
      <Stack>
        <CodeableConceptInput
          name="request"
          path="MedicationRequest.medication[x]"
          data-autofocus={true}
          binding={HTTP + 'cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1010.4'}
          maxValues={1}
          defaultValue={medication?.medicationCodeableConcept}
          onChange={(request) => setCode(request)}
          outcome={undefined}
        />
        <Radio.Group name="status" label="Request Status" required defaultValue={medication?.status}>
          {statusValues.map((sv) => (
            <Radio key={sv} value={sv} label={sv} my="xs" required />
          ))}
        </Radio.Group>
        <Group justify="flex-end" gap={4}>
          <Button type="submit">Save</Button>
        </Group>
      </Stack>
    </Form>
  );
}

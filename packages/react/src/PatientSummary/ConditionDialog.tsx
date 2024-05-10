import { Button, Group, Stack } from '@mantine/core';
import { HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG, addProfileToResource, createReference } from '@medplum/core';
import { CodeableConcept, Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { useCallback, useState } from 'react';
import { CodeableConceptInput } from '../CodeableConceptInput/CodeableConceptInput';
import { DateTimeInput } from '../DateTimeInput/DateTimeInput';
import { convertLocalToIso } from '../DateTimeInput/DateTimeInput.utils';
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
      const updatedCondition: Condition = addProfileToResource(
        {
          ...condition,
          resourceType: 'Condition',
          category: [
            {
              coding: [
                {
                  system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/condition-category',
                  code: 'problem-list-item',
                  display: 'Problem List Item',
                },
              ],
              text: 'Problem List Item',
            },
          ],
          subject: createReference(patient),
          encounter: encounter && createReference(encounter),
          code,
          clinicalStatus,
          onsetDateTime: formData.onsetDateTime ? convertLocalToIso(formData.onsetDateTime) : undefined,
        },
        HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns'
      );
      onSubmit(updatedCondition);
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
          binding={HTTP_HL7_ORG + '/fhir/us/core/ValueSet/us-core-condition-code'}
          defaultValue={condition?.code}
          onChange={(code) => setCode(code)}
          outcome={undefined}
        />
        <CodeableConceptInput
          name="clinicalStatus"
          label="Status"
          path="Condition.clinicalStatus"
          binding={HTTP_HL7_ORG + '/fhir/ValueSet/condition-clinical'}
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

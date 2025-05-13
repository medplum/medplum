import { DateTimeInput } from '@medplum/react';
import { CodeableConceptInput, convertLocalToIso } from '@medplum/react';
import { Group } from '@mantine/core';
import { Stack } from '@mantine/core';
import { Form, SubmitButton } from '@medplum/react';
import React, { useCallback, useState } from 'react';
import { addProfileToResource, createReference, HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG } from '@medplum/core';
import { CodeableConcept, Condition } from '@medplum/fhirtypes';
import { Encounter } from '@medplum/fhirtypes';
import { Patient } from '@medplum/fhirtypes';

export interface ConditionDialogProps {
  readonly patient: Patient;
  readonly encounter: Encounter;
  readonly onSubmit: (condition: Condition) => void;
}

export default function ConditionModal(props: ConditionDialogProps): JSX.Element {
  const { patient, encounter, onSubmit } = props;
  const [code, setCode] = useState<CodeableConcept | undefined>();
  const [clinicalStatus, setClinicalStatus] = useState<CodeableConcept | undefined>();

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      const updatedCondition: Condition = addProfileToResource(
        {
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
        },
        HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns'
      );

      onSubmit(updatedCondition);
    },
    [patient, encounter, code, clinicalStatus, onSubmit]
  );

  return (
    <Form onSubmit={handleSubmit}>
      <Stack>
        <CodeableConceptInput
          name="code"
          label="Problem"
          path="Condition.code"
          data-autofocus={true}
          binding={HTTP_HL7_ORG + '/fhir/us/core/ValueSet/us-core-condition-code'}
          onChange={(code) => setCode(code)}
          outcome={undefined}
        />
        <CodeableConceptInput
          name="clinicalStatus"
          label="Status"
          path="Condition.clinicalStatus"
          binding={HTTP_HL7_ORG + '/fhir/ValueSet/condition-clinical'}
          onChange={(clinicalStatus) => setClinicalStatus(clinicalStatus)}
          outcome={undefined}
        />
        <Group justify="flex-end" gap={4} mt="md">
          <SubmitButton>Save</SubmitButton>
        </Group>
      </Stack>
    </Form>
  );
}

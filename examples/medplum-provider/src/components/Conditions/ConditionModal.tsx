import { CodeableConceptInput, Form, SubmitButton } from '@medplum/react';
import { Group, Stack } from '@mantine/core';
import { useCallback, useState, JSX } from 'react';
import { addProfileToResource, createReference, HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG } from '@medplum/core';
import { CodeableConcept, Condition, Encounter, Patient } from '@medplum/fhirtypes';

export interface ConditionDialogProps {
  readonly patient: Patient;
  readonly encounter: Encounter;
  readonly onSubmit: (condition: Condition) => void;
}

export default function ConditionModal(props: ConditionDialogProps): JSX.Element {
  const { patient, encounter, onSubmit } = props;
  const [problem, setProblem] = useState<CodeableConcept | undefined>();
  const [diagnosis, setDiagnosis] = useState<CodeableConcept | undefined>();
  const [clinicalStatus, setClinicalStatus] = useState<CodeableConcept | undefined>();

  const handleSubmit = useCallback(() => {
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
        code: {
          coding: [...(problem?.coding || []), ...(diagnosis?.coding || [])],
        },
        clinicalStatus,
      },
      HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns'
    );

    onSubmit(updatedCondition);
  }, [patient, encounter, problem, diagnosis, clinicalStatus, onSubmit]);

  return (
    <Form onSubmit={handleSubmit}>
      <Stack>
        <CodeableConceptInput
          name="code"
          label="Problem"
          path="Condition.code"
          required
          binding={HTTP_HL7_ORG + '/fhir/us/core/ValueSet/us-core-condition-code'}
          onChange={(problem) => setProblem(problem)}
        />

        <CodeableConceptInput
          binding="http://hl7.org/fhir/ValueSet/icd-10"
          label="ICD-10 Code"
          name="diagnosis"
          path="Condition.code"
          required
          onChange={(diagnosis) => setDiagnosis(diagnosis)}
        />

        <CodeableConceptInput
          name="clinicalStatus"
          label="Status"
          path="Condition.clinicalStatus"
          binding={HTTP_HL7_ORG + '/fhir/ValueSet/condition-clinical'}
          onChange={(clinicalStatus) => setClinicalStatus(clinicalStatus)}
          required
        />
        <Group justify="flex-end" gap={4} mt="md">
          <SubmitButton>Save</SubmitButton>
        </Group>
      </Stack>
    </Form>
  );
}

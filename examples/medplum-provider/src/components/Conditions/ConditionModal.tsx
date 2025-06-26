import { CodeableConceptInput, Form, SubmitButton } from '@medplum/react';
import { Group, Stack } from '@mantine/core';
import { useCallback, useState, JSX } from 'react';
import { addProfileToResource, createReference, HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG } from '@medplum/core';
import { CodeableConcept, Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { showErrorNotification } from '../../utils/notifications';

export interface ConditionDialogProps {
  readonly patient: Patient;
  readonly encounter: Encounter;
  readonly onSubmit: (condition: Condition) => void;
}

export default function ConditionModal(props: ConditionDialogProps): JSX.Element {
  const { patient, encounter, onSubmit } = props;
  const [diagnosis, setDiagnosis] = useState<CodeableConcept | undefined>();
  const [clinicalStatus, setClinicalStatus] = useState<CodeableConcept | undefined>();

  const handleSubmit = useCallback(() => {
    if (!diagnosis) {
      showErrorNotification('Please select a diagnosis');
      return;
    }

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
          coding: diagnosis.coding ? [...diagnosis.coding] : [],
        },
        clinicalStatus,
      },
      HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns'
    );

    onSubmit(updatedCondition);
  }, [patient, encounter, diagnosis, clinicalStatus, onSubmit]);

  return (
    <Form onSubmit={handleSubmit}>
      <Stack>
        <CodeableConceptInput
          binding="http://hl7.org/fhir/sid/icd-10-cm/vs"
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

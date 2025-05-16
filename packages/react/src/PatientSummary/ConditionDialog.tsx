import { Stack, Radio, Button, Modal } from '@mantine/core';
import { HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG, addProfileToResource, createReference } from '@medplum/core';
import { CodeableConcept, Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { JSX, useCallback, useState } from 'react';
import { CodeableConceptInput } from '../CodeableConceptInput/CodeableConceptInput';
import { DateInput } from '../DateTimeInput/DateInput';
import { convertLocalToIso } from '../DateTimeInput/DateTimeInput.utils';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';

export interface ConditionDialogProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly condition?: Condition;
  readonly onSubmit: (condition: Condition) => void;
  readonly onClose?: () => void;
}

const clinicalStatusValues = [
  'active',
  'recurrence',
  'relapse',
  'inactive',
  'remission',
  'resolved',
];

export function ConditionDialog(props: ConditionDialogProps): JSX.Element {
  const { patient, encounter, condition, onSubmit } = props;
  const [code, setCode] = useState<CodeableConcept | undefined>(condition?.code);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      onSubmit(
        addProfileToResource(
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
            clinicalStatus: {
              coding: [
                {
                  system: HTTP_HL7_ORG + '/fhir/ValueSet/condition-clinical',
                  code: formData.clinicalStatus,
                },
              ],
            },
            onsetDateTime: formData.onsetDateTime ? convertLocalToIso(formData.onsetDateTime) : undefined,
          },
          HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns'
        )
      );
      if (props.onClose) {
        props.onClose();
      }
    },
    [patient, encounter, condition, code, onSubmit, props]
  );

  const handleDelete = useCallback(() => {
    if (!condition) {
      return;
    }
    onSubmit({
      ...condition,
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
            code: 'entered-in-error',
          },
        ],
      },
    });
    setDeleteModalOpen(false);
  }, [condition, onSubmit]);

  return (
    <>
      <Modal opened={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} centered title="Delete Problem?">
        <Stack>
          <div style={{ textAlign: 'center', fontWeight: 500, marginBottom: 16 }}>
            Are you sure you want to delete this problem?
          </div>
          <Button color="red" fullWidth onClick={handleDelete}>
            Yes, delete this problem
          </Button>
          <Button variant="outline" fullWidth onClick={() => setDeleteModalOpen(false)}>
            Cancel
          </Button>
        </Stack>
      </Modal>
      <Form onSubmit={handleSubmit} style={{ marginTop: 0 }}>
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
          <Radio.Group 
            name="clinicalStatus" 
            label="Clinical Status" 
            required 
            defaultValue={condition?.clinicalStatus?.coding?.[0]?.code}
          >
            {clinicalStatusValues.map((sv) => (
              <Radio key={sv} value={sv} label={sv} my="xs" required />
            ))}
          </Radio.Group>
          <DateInput 
            name="onsetDateTime" 
            label="Diagnosis Date" 
            defaultValue={condition?.onsetDateTime} 
            required 
          />
          <SubmitButton fullWidth style={{ marginTop: 8 }}>Save</SubmitButton>
          {condition?.id && (
            <Button
              color="red"
              variant="outline"
              fullWidth
              style={{ marginTop: 4, marginBottom: 0 }}
              onClick={() => setDeleteModalOpen(true)}
            >
              Delete
            </Button>
          )}
        </Stack>
      </Form>
    </>
  );
}

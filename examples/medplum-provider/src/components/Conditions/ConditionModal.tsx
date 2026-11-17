// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Flex, Select, Stack, Text } from '@mantine/core';
import {
  addProfileToResource,
  capitalize,
  createReference,
  HTTP_HL7_ORG,
  HTTP_TERMINOLOGY_HL7_ORG,
} from '@medplum/core';
import type { Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { CodeableConceptInput, Modal, SubmitButton } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { ConditionStatusBadge } from './ConditionStatusBadge';

export interface ConditionDialogProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly patient: Patient;
  readonly encounter: Encounter;
  readonly onSubmit: (condition: Condition) => void;
}

const CLINICAL_STATUS_SYSTEM = HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/condition-clinical';

const CLINICAL_STATUSES = ['active', 'recurrence', 'relapse', 'inactive', 'remission', 'resolved'].map((code) => ({
  value: code,
  label: capitalize(code),
}));

function toClinicalStatus(code: string): Condition['clinicalStatus'] {
  return { coding: [{ system: CLINICAL_STATUS_SYSTEM, code, display: capitalize(code) }] };
}

const ACTIVE_STATUS = toClinicalStatus('active');

export default function ConditionModal(props: ConditionDialogProps): JSX.Element {
  const { opened, onClose, patient, encounter, onSubmit } = props;
  const [diagnosis, setDiagnosis] = useState<Condition['code']>();
  const [clinicalStatus, setClinicalStatus] = useState<Condition['clinicalStatus']>(ACTIVE_STATUS);
  const coding = diagnosis?.coding?.[0];
  const statusCoding = clinicalStatus?.coding?.[0];

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

    setDiagnosis(undefined);
    setClinicalStatus(ACTIVE_STATUS);
    onSubmit(updatedCondition);
  }, [patient, encounter, diagnosis, clinicalStatus, onSubmit]);

  const close = (): void => {
    setDiagnosis(undefined);
    setClinicalStatus(ACTIVE_STATUS);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Add New Diagnosis"
      onSubmit={handleSubmit}
      actions={<SubmitButton>Save</SubmitButton>}
    >
      <Stack gap="md">
        <CodeableConceptInput
          binding="http://hl7.org/fhir/sid/icd-10-cm/vs/billable"
          label="ICD-10 Code"
          description="Billable ICD-10-CM codes"
          placeholder="Search by code or name"
          name="diagnosis"
          path="Condition.code"
          required
          maxValues={1}
          onChange={(diagnosis) => setDiagnosis(diagnosis)}
        />

        <Select
          label="Status"
          name="clinicalStatus"
          required
          allowDeselect={false}
          data={CLINICAL_STATUSES}
          value={statusCoding?.code ?? 'active'}
          onChange={(code) => code && setClinicalStatus(toClinicalStatus(code))}
        />

        {coding && (
          <Stack gap={0}>
            <Divider />
            <Flex align="center" gap="md" py="sm">
              <Text size="sm" fw={600} w={80}>
                {coding.code}
              </Text>
              <Text size="sm" flex={1} miw={0}>
                {coding.display}
              </Text>
              <ConditionStatusBadge clinicalStatus={clinicalStatus} />
            </Flex>
            <Divider />
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}

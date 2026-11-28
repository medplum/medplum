// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Flex, Select, Stack, Tabs, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
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
import { useState } from 'react';
import classes from './ConditionModal.module.css';
import { ConditionStatusBadge } from './ConditionStatusBadge';
import { ExistingConditionPicker } from './ExistingConditionPicker';

type ConditionTab = 'existing' | 'new';

/**
 * Props for ConditionModal.
 * - opened / onClose: modal visibility.
 * - patient / encounter: the context a new diagnosis is created in.
 * - excludeCodes: diagnosis codes already on the encounter, left out of the existing list.
 * - onSubmit: called with a new, unsaved Condition from the New Diagnosis tab.
 * - onSelectExisting: called with the Condition chosen on the Existing Diagnosis tab.
 */
export interface ConditionDialogProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly patient: WithId<Patient>;
  readonly encounter: Encounter;
  readonly excludeCodes: string[];
  readonly onSubmit: (condition: Condition) => void;
  readonly onSelectExisting: (condition: WithId<Condition>) => void;
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
  const { opened, onClose, patient, encounter, excludeCodes, onSubmit, onSelectExisting } = props;
  const [tab, setTab] = useState<ConditionTab>('existing');
  const [existing, setExisting] = useState<WithId<Condition>>();
  const [diagnosis, setDiagnosis] = useState<Condition['code']>();
  const [clinicalStatus, setClinicalStatus] = useState<Condition['clinicalStatus']>(ACTIVE_STATUS);
  const coding = diagnosis?.coding?.[0];
  const statusCoding = clinicalStatus?.coding?.[0];

  const reset = (): void => {
    setTab('existing');
    setExisting(undefined);
    setDiagnosis(undefined);
    setClinicalStatus(ACTIVE_STATUS);
  };

  const close = (): void => {
    reset();
    onClose();
  };

  const handleSubmit = (): void => {
    if (tab === 'existing') {
      if (existing) {
        reset();
        onSelectExisting(existing);
      }
      return;
    }
    if (!diagnosis) {
      return;
    }

    const newCondition: Condition = addProfileToResource(
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

    reset();
    onSubmit(newCondition);
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Add Diagnosis"
      size="lg"
      bodyHeight="26rem"
      onSubmit={handleSubmit}
      actions={<SubmitButton disabled={tab === 'existing' ? !existing : !diagnosis}>Add Diagnosis</SubmitButton>}
    >
      <Tabs
        variant="pills"
        radius="xl"
        value={tab}
        onChange={(value) => setTab(value as ConditionTab)}
        classNames={{ tab: classes.tab }}
      >
        <Tabs.List>
          <Tabs.Tab value="existing">Existing Diagnosis</Tabs.Tab>
          <Tabs.Tab value="new">New Diagnosis</Tabs.Tab>
        </Tabs.List>
        <Divider my="md" />

        <Tabs.Panel value="existing">
          <ExistingConditionPicker
            patient={patient}
            excludeCodes={excludeCodes}
            value={existing}
            onChange={setExisting}
          />
        </Tabs.Panel>

        <Tabs.Panel value="new">
          <Stack gap="md">
            <CodeableConceptInput
              binding="http://hl7.org/fhir/sid/icd-10-cm/vs/billable"
              label="ICD-10 Code"
              placeholder="Search by code or name"
              name="diagnosis"
              path="Condition.code"
              required={tab === 'new'}
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
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex, Group, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { getDisplayString } from '@medplum/core';
import { Encounter, MedicationRequest, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { JSX, useCallback, useState } from 'react';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { CollapsibleSection } from './CollapsibleSection';
import { MedicationDialog } from './MedicationDialog';
import SummaryItem from './SummaryItem';
import styles from './SummaryItem.module.css';

export interface MedicationsProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly medicationRequests: MedicationRequest[];
  readonly onClickResource?: (resource: MedicationRequest) => void;
}

export function Medications(props: MedicationsProps): JSX.Element {
  const medplum = useMedplum();
  const [medicationRequests, setMedicationRequests] = useState<MedicationRequest[]>(props.medicationRequests);
  const [editMedication, setEditMedication] = useState<MedicationRequest>();
  const [opened, { open, close }] = useDisclosure(false);

  const handleSubmit = useCallback(
    async (medication: MedicationRequest) => {
      if (medication.id) {
        const updatedMedication = await medplum.updateResource(medication);
        setMedicationRequests(medicationRequests.map((m) => (m.id === updatedMedication.id ? updatedMedication : m)));
      } else {
        const newMedication = await medplum.createResource(medication);
        setMedicationRequests([newMedication, ...medicationRequests]);
      }

      setEditMedication(undefined);
      close();
    },
    [medplum, medicationRequests, close]
  );

  return (
    <>
      <CollapsibleSection
        title="Medications"
        onAdd={() => {
          setEditMedication(undefined);
          open();
        }}
      >
        {medicationRequests.length > 0 ? (
          <Flex direction="column" gap={8}>
            {medicationRequests.map((medication) => (
              <SummaryItem
                key={medication.id}
                onClick={() => {
                  setEditMedication(medication);
                  open();
                }}
              >
                <Box>
                  <Text fw={500} className={styles.itemText}>
                    {getDisplayString(medication)}
                  </Text>
                  <Group mt={2} gap={4}>
                    {medication.status && (
                      <StatusBadge
                        color={getStatusColor(medication.status)}
                        variant="light"
                        status={medication.status}
                      />
                    )}
                  </Group>
                </Box>
              </SummaryItem>
            ))}
          </Flex>
        ) : (
          <Text>(none)</Text>
        )}
      </CollapsibleSection>
      <Modal opened={opened} onClose={close} title={editMedication ? 'Edit Medication' : 'Add Medication'}>
        <MedicationDialog
          patient={props.patient}
          encounter={props.encounter}
          medication={editMedication}
          onSubmit={handleSubmit}
        />
      </Modal>
    </>
  );
}

function getStatusColor(status?: string): string {
  if (!status) {
    return 'gray';
  }

  switch (status) {
    case 'active':
      return 'green';
    case 'stopped':
      return 'red';
    case 'on-hold':
      return 'yellow';
    case 'cancelled':
      return 'red';
    case 'completed':
      return 'blue';
    case 'entered-in-error':
      return 'red';
    case 'draft':
      return 'gray';
    default:
      return 'gray';
  }
}

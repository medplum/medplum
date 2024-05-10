import { Anchor, Box, Group, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Encounter, MedicationRequest, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useState } from 'react';
import { killEvent } from '../utils/dom';
import { ConceptBadge } from './ConceptBadge';
import { MedicationDialog } from './MedicationDialog';

export interface MedicationsProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly medicationRequests: MedicationRequest[];
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
      <Group justify="space-between">
        <Text fz="md" fw={700}>
          Medications
        </Text>
        <Anchor
          component="button"
          onClick={(e) => {
            killEvent(e);
            setEditMedication(undefined);
            open();
          }}
        >
          + Add
        </Anchor>
      </Group>
      {medicationRequests.length > 0 ? (
        <Box>
          {medicationRequests.map((request) => (
            <ConceptBadge<MedicationRequest>
              key={request.id}
              resource={request}
              onEdit={(mr) => {
                setEditMedication(mr);
                open();
              }}
            />
          ))}
        </Box>
      ) : (
        <Text>(none)</Text>
      )}
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

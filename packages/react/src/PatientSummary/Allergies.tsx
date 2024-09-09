import { Anchor, Box, Group, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { AllergyIntolerance, Encounter, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useState } from 'react';
import { killEvent } from '../utils/dom';
import { AllergyDialog } from './AllergyDialog';
import { ConceptBadge } from './ConceptBadge';

export interface AllergiesProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly allergies: AllergyIntolerance[];
}

export function Allergies(props: AllergiesProps): JSX.Element {
  const medplum = useMedplum();
  const { patient, encounter } = props;
  const [allergies, setAllergies] = useState<AllergyIntolerance[]>(props.allergies);
  const [opened, { open, close }] = useDisclosure(false);
  const [editAllergy, setEditAllergy] = useState<AllergyIntolerance>();

  const handleSubmit = useCallback(
    async (allergy: AllergyIntolerance) => {
      if (allergy.id) {
        const updatedAllergy = await medplum.updateResource(allergy);
        setAllergies(allergies.map((a) => (a.id === updatedAllergy.id ? updatedAllergy : a)));
      } else {
        const newAllergy = await medplum.createResource(allergy);
        setAllergies([...allergies, newAllergy]);
      }
      setEditAllergy(undefined);
      close();
    },
    [medplum, allergies, close]
  );

  return (
    <>
      <Group justify="space-between">
        <Text fz="md" fw={700}>
          Allergies
        </Text>
        <Anchor
          component="button"
          onClick={(e) => {
            killEvent(e);
            setEditAllergy(undefined);
            open();
          }}
        >
          + Add
        </Anchor>
      </Group>
      {allergies.length > 0 ? (
        <Box>
          {allergies.map((allergy) => (
            <ConceptBadge
              key={allergy.id}
              resource={allergy}
              onEdit={(a) => {
                setEditAllergy(a);
                open();
              }}
            />
          ))}
        </Box>
      ) : (
        <Text>(none)</Text>
      )}
      <Modal opened={opened} onClose={close} title={editAllergy ? 'Edit Allergy' : 'Add Allergy'}>
        <AllergyDialog patient={patient} encounter={encounter} allergy={editAllergy} onSubmit={handleSubmit} />
      </Modal>
    </>
  );
}

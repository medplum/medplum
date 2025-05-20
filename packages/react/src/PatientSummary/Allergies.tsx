import { ActionIcon, Box, Collapse, Flex, Group, Modal, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { getDisplayString } from '@medplum/core';
import { AllergyIntolerance, Encounter, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconChevronDown, IconPlus } from '@tabler/icons-react';
import { JSX, useCallback, useMemo, useState } from 'react';
import { killEvent } from '../utils/dom';
import { AllergyDialog } from './AllergyDialog';
import SummaryItem from './SummaryItem';
import styles from './PatientSummary.module.css';

export interface AllergiesProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly allergies: AllergyIntolerance[];
  readonly onClickResource?: (resource: AllergyIntolerance) => void;
}

export function Allergies(props: AllergiesProps): JSX.Element {
  const medplum = useMedplum();
  const { patient, encounter } = props;
  const [allergies, setAllergies] = useState<AllergyIntolerance[]>(props.allergies);
  const [opened, { open, close }] = useDisclosure(false);
  const [editAllergy, setEditAllergy] = useState<AllergyIntolerance>();
  const [collapsed, setCollapsed] = useState(false);

  // Sort allergies with active ones first
  const sortedAllergies = useMemo(() => {
    return [...allergies].sort((a, b) => {
      const aStatus = a.clinicalStatus?.coding?.[0]?.code;
      const bStatus = b.clinicalStatus?.coding?.[0]?.code;

      // Active allergies first
      if (aStatus === 'active' && bStatus !== 'active') {
        return -1;
      }
      if (aStatus !== 'active' && bStatus === 'active') {
        return 1;
      }

      // Then sort by name
      return getDisplayString(a).localeCompare(getDisplayString(b));
    });
  }, [allergies]);

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
      <Box style={{ position: 'relative' }}>
        <UnstyledButton className={styles.patientSummaryHeader}>
          <Group justify="space-between">
            <Group gap={8}>
              <ActionIcon
                variant="subtle"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? 'Show allergies' : 'Hide allergies'}
                className={`${styles.patientSummaryCollapseIcon} ${collapsed ? styles.collapsed : ''}`}
                size="md"
              >
                <IconChevronDown size={20} />
              </ActionIcon>
              <Text fz="md" fw={800} onClick={() => setCollapsed((c) => !c)}>
                Allergies
              </Text>
            </Group>
            <ActionIcon
              className={`${styles.patientSummaryAddButton} add-button`}
              variant="subtle"
              onClick={(e) => {
                killEvent(e);
                setEditAllergy(undefined);
                open();
              }}
              size="md"
            >
              <IconPlus size={18} />
            </ActionIcon>
          </Group>
        </UnstyledButton>
        <Collapse in={!collapsed}>
          {sortedAllergies.length > 0 ? (
            <Box ml="36" mt="8" mb="16">
              <Flex direction="column" gap={8}>
                {sortedAllergies.map((allergy) => (
                  <SummaryItem
                    title={getDisplayString(allergy)}
                    status={allergy.clinicalStatus?.coding?.[0]?.code || 'unknown'}
                    color={getClinicalStatusColor(allergy.clinicalStatus?.coding?.[0]?.code)}
                    onClick={() => {
                      setEditAllergy(allergy);
                      open();
                    }}
                  />
                ))}
              </Flex>
           
            </Box>
          ) : (
            <Box ml="36" my="4">
              <Text>(none)</Text>
            </Box>
          )}
        </Collapse>
      </Box>
      <Modal opened={opened} onClose={close} title={editAllergy ? 'Edit Allergy' : 'Add Allergy'}>
        <AllergyDialog patient={patient} encounter={encounter} allergy={editAllergy} onSubmit={handleSubmit} />
      </Modal>
    </>
  );
}

function getClinicalStatusColor(status?: string): string {
  if (!status) {
    return 'gray';
  }

  switch (status) {
    case 'active':
      return 'red';
    case 'inactive':
      return 'orange';
    case 'resolved':
      return 'blue';
    default:
      return 'gray';
  }
}

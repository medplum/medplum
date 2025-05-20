import { ActionIcon, Box, Collapse, Flex, Group, Modal, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconChevronDown, IconChevronRight, IconPlus } from '@tabler/icons-react';
import { JSX, useCallback, useState } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { killEvent } from '../utils/dom';
import styles from './PatientSummary.module.css';
import { SocialHistoryDialog } from './SocialHistoryDialog';

export interface SocialHistoryProps {
  readonly patient: Patient;
  readonly observations: Observation[];
  readonly onClickResource?: (resource: Observation) => void;
}

export function SocialHistory(props: SocialHistoryProps): JSX.Element {
  const medplum = useMedplum();
  const [observations, setObservations] = useState<Observation[]>(props.observations);
  const [editObservation, setEditObservation] = useState<Observation>();
  const [opened, { open, close }] = useDisclosure(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleSubmit = useCallback(
    async (observation: Observation) => {
      if (observation.id) {
        const updatedObservation = await medplum.updateResource(observation);
        setObservations(observations.map((o) => (o.id === updatedObservation.id ? updatedObservation : o)));
      } else {
        const newObservation = await medplum.createResource(observation);
        setObservations([newObservation, ...observations]);
      }
      setEditObservation(undefined);
      close();
    },
    [medplum, observations, close]
  );

  const getDisplayValue = (observation: Observation): string => {
    if (observation.valueCodeableConcept) {
      return (
        observation.valueCodeableConcept.text ||
        observation.valueCodeableConcept.coding?.[0]?.display ||
        observation.valueCodeableConcept.coding?.[0]?.code ||
        'No value'
      );
    }
    return 'No value';
  };

  const getDisplayName = (observation: Observation): string => {
    if (observation.code) {
      return (
        observation.code.text ||
        observation.code.coding?.[0]?.display ||
        observation.code.coding?.[0]?.code ||
        'Unknown'
      );
    }
    return 'Unknown';
  };

  return (
    <Box style={{ position: 'relative' }}>
      <UnstyledButton className={styles.patientSummaryHeader}>
        <Group justify="space-between">
          <Group gap={8}>
            <ActionIcon
              variant="subtle"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Show social history' : 'Hide social history'}
              className={`${styles.patientSummaryCollapseIcon} ${collapsed ? styles.collapsed : ''}`}
              size="md"
            >
              <IconChevronDown size={20} />
            </ActionIcon>
            <Text fz="md" fw={800} onClick={() => setCollapsed((c) => !c)}>
              Social History
            </Text>
          </Group>
          <ActionIcon
            className={`${styles.patientSummaryAddButton} add-button`}
            variant="subtle"
            onClick={(e) => {
              if (e) {
                killEvent(e);
              }
              setEditObservation(undefined);
              open();
            }}
            size="md"
          >
            <IconPlus size={18} />
          </ActionIcon>
        </Group>
      </UnstyledButton>
      <Collapse in={!collapsed}>
        {observations.length > 0 ? (
          <Box ml="36" mt="8" mb="16">
            <Flex direction="column" gap={8}>
              {observations.map((observation) => (
                <MedplumLink
                  key={observation.id}
                  to={`/Observation/${observation.id}`}
                  style={{ textDecoration: 'none', display: 'block', color: 'black' }}
                >
                  <Box
                    className={styles.patientSummaryListItem}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      if (e) {
                        killEvent(e);
                      }
                      if (props.onClickResource) {
                        props.onClickResource(observation);
                      }
                    }}
                  >
                    <Box style={{ position: 'relative' }}>
                      <Text
                        size="sm"
                        fw={500}
                        mb={2}
                        style={{ whiteSpace: 'normal', overflow: 'visible', textOverflow: 'unset' }}
                      >
                        {getDisplayName(observation)}:{' '}
                        <span style={{ fontWeight: 400 }}>{getDisplayValue(observation)}</span>
                      </Text>
                      <div className={styles.patientSummaryGradient} />
                      <div className={styles.patientSummaryChevronContainer}>
                        <ActionIcon
                          className={styles.patientSummaryChevron}
                          size="md"
                          variant="transparent"
                          tabIndex={-1}
                        >
                          <IconChevronRight size={16} stroke={2.5} />
                        </ActionIcon>
                      </div>
                    </Box>
                  </Box>
                </MedplumLink>
              ))}
            </Flex>
          </Box>
        ) : (
          <Box ml="36" my="4">
            <Text>(none)</Text>
          </Box>
        )}
      </Collapse>
      <Modal
        opened={opened}
        onClose={close}
        title={
          <span style={{ fontWeight: 700 }}>{editObservation ? 'Edit Social History' : 'Add Social History'}</span>
        }
      >
        <SocialHistoryDialog patient={props.patient} observation={editObservation} onSubmit={handleSubmit} />
      </Modal>
    </Box>
  );
}

import { Box, Group, Text, Collapse, ActionIcon, UnstyledButton, Flex, Badge, Modal, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
<<<<<<< HEAD
import { Encounter, MedicationRequest, Patient, Medication } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { useCallback, useState, useRef, useEffect } from 'react';
=======
import { Encounter, MedicationRequest, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { JSX, useCallback, useState } from 'react';
>>>>>>> 4cb9bdde1003c3442929ae147d71f8e9fa439015
import { killEvent } from '../utils/dom';
import { IconChevronDown, IconPlus, IconPencil, IconChevronRight } from '@tabler/icons-react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { formatDate } from '@medplum/core';
import { MedicationDialog } from './MedicationDialog';
import { ResourceName } from '../ResourceName/ResourceName';
import styles from './PatientSummary.module.css';

export interface MedicationsProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly medicationRequests: MedicationRequest[];
  readonly onClickResource?: (resource: MedicationRequest) => void;
}

function getMedicationDisplayText(medication: MedicationRequest): React.ReactNode {
  if (medication.medicationReference) {
    const med = useResource<Medication>(medication.medicationReference);
    if (med?.code?.text) {
      return med.code.text;
    }
    if (med?.code?.coding?.[0]?.display) {
      return med.code.coding[0].display;
    }
  }
  if (medication.medicationCodeableConcept?.text) {
    return medication.medicationCodeableConcept.text;
  }
  if (medication.medicationCodeableConcept?.coding?.[0]?.display) {
    return medication.medicationCodeableConcept.coding[0].display;
  }
  return 'Unknown Medication';
}

export function Medications(props: MedicationsProps): JSX.Element {
  const medplum = useMedplum();
  const [medicationRequests, setMedicationRequests] = useState<MedicationRequest[]>(props.medicationRequests);
  const [editMedication, setEditMedication] = useState<MedicationRequest>();
  const [opened, { open, close }] = useDisclosure(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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

  // Helper function to get status badge color
  const getStatusColor = (status?: string): string => {
    if (!status) return 'gray';
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
  };

  return (
    <>
      <Box style={{ position: 'relative' }}>
        <UnstyledButton
          style={{
            width: '100%',
            cursor: 'default',
            '&:hover .add-button': {
              opacity: 1
            },
            '& .mantine-ActionIcon-root, & .mantine-Text-root': {
              cursor: 'pointer',
              margin: '0'
            }
          }}
        >
          <Group justify="space-between">
            <Group gap={8}>
              <ActionIcon
                variant="subtle"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? 'Show medications' : 'Hide medications'}
                style={{ transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                size="md"
              >
                <IconChevronDown size={20} />
              </ActionIcon>
              <Text fz="md" fw={800} onClick={() => setCollapsed((c) => !c)} style={{ cursor: 'pointer' }}>
                Medications
              </Text>
            </Group>
            <ActionIcon
              className={`${styles.patientSummaryAddButton} add-button`}
              variant="subtle"
              onClick={(e) => {
                killEvent(e);
                setEditMedication(undefined);
                open();
              }}
              size="md"
            >
              <IconPlus size={18} />
            </ActionIcon>
          </Group>
        </UnstyledButton>
        <Collapse in={!collapsed}>
          {medicationRequests.length > 0 ? (
            <Box ml="36" mt="8" mb="16">
              <Flex direction="column" gap={8}>
                {medicationRequests.map((medication, index) => {
                  const [isOverflowed, setIsOverflowed] = useState(false);
                  const textRef = useRef<HTMLDivElement>(null);
                  
                  useEffect(() => {
                    const el = textRef.current;
                    if (el) {
                      setIsOverflowed(el.scrollWidth > el.clientWidth);
                    }
                  }, [medication]);

                  const displayText = getMedicationDisplayText(medication);

                  return (
                    <Box 
                      key={medication.id}
                      className={styles.patientSummaryListItem}
                      onMouseEnter={() => setHoverIndex(index)}
                      onMouseLeave={() => setHoverIndex(null)}
                      onClick={(e) => {
                        killEvent(e);
                        setEditMedication(medication);
                        open();
                      }}
                    >
                      <Tooltip label={displayText} position="top-start" openDelay={650} disabled={!isOverflowed}>
                        <Box style={{ position: 'relative' }}>
                          <Text 
                            ref={textRef}
                            size="sm" 
                            className={styles.patientSummaryListItemText}
                          >
                            {displayText}
                          </Text>
                          <Group mt={2} gap={4}>
                            {medication.status && (
                              <Badge 
                                size="xs" 
                                color={getStatusColor(medication.status)}
                                variant="light"
                                className={styles.patientSummaryBadge}
                              >
                                {medication.status}
                              </Badge>
                            )}
                          </Group>
                          <div className={styles.patientSummaryGradient} />
                          <div className={styles.patientSummaryChevronContainer}>
                            <ActionIcon
                              className={styles.patientSummaryChevron}
                              size="md"
                              variant="transparent"
                              tabIndex={-1}
                            >
                              <IconChevronRight size={16} stroke={2.5}/>
                            </ActionIcon>
                          </div>
                        </Box>
                      </Tooltip>
                    </Box>
                  );
                })}
              </Flex>
            </Box>
          ) : (
            <Box ml="36" my="4">
              <Text>(none)</Text>
            </Box>
          )}
        </Collapse>
        <style>{`
          .mantine-UnstyledButton-root:hover .add-button {
            opacity: 1 !important;
          }
        `}</style>
      </Box>
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

import { ActionIcon, Badge, Box, Collapse, Flex, Group, Modal, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { getDisplayString } from '@medplum/core';
import { AllergyIntolerance, Encounter, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconChevronDown, IconChevronRight, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { killEvent } from '../utils/dom';
import { AllergyDialog } from './AllergyDialog';
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
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Sort allergies with active ones first
  const sortedAllergies = useMemo(() => {
    return [...allergies].sort((a, b) => {
      const aStatus = a.clinicalStatus?.coding?.[0]?.code;
      const bStatus = b.clinicalStatus?.coding?.[0]?.code;

      // Active allergies first
      if (aStatus === 'active' && bStatus !== 'active') return -1;
      if (aStatus !== 'active' && bStatus === 'active') return 1;

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

  // Helper function to handle click on an allergy
  const handleAllergyClick = useCallback(
    (allergy: AllergyIntolerance, e?: React.MouseEvent) => {
      if (e) {
        killEvent(e);
      }

      // Always open the edit modal
      setEditAllergy(allergy);
      open();
    },
    [open]
  );

  // Helper function to get clinical status badge color
  const getClinicalStatusColor = (status?: string): string => {
    if (!status) return 'gray';

    switch (status) {
      case 'active':
        return 'red'; // Changed from green to red
      case 'inactive':
        return 'orange';
      case 'resolved':
        return 'blue';
      default:
        return 'gray';
    }
  };

  // Helper function to get verification status badge color
  const getVerificationStatusColor = (status?: string): string => {
    if (!status) return 'gray';

    switch (status) {
      case 'confirmed':
        return 'green';
      case 'presumed':
        return 'yellow';
      case 'unconfirmed':
        return 'orange';
      case 'refuted':
        return 'red';
      case 'entered-in-error':
        return 'gray';
      default:
        return 'gray';
    }
  };

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
                {sortedAllergies.map((allergy, index) => {
                  const [isOverflowed, setIsOverflowed] = useState(false);
                  const textRef = useRef<HTMLDivElement>(null);

                  useEffect(() => {
                    const el = textRef.current;
                    if (el) {
                      setIsOverflowed(el.scrollWidth > el.clientWidth);
                    }
                  }, [allergy]);

                  return (
                    <Box
                      key={allergy.id}
                      className={styles.patientSummaryListItem}
                      onMouseEnter={() => setHoverIndex(index)}
                      onMouseLeave={() => setHoverIndex(null)}
                      onClick={(e) => handleAllergyClick(allergy, e)}
                    >
                      <Tooltip
                        label={getDisplayString(allergy)}
                        position="top-start"
                        openDelay={650}
                        disabled={!isOverflowed}
                      >
                        <Box style={{ position: 'relative' }}>
                          <Text ref={textRef} size="sm" className={styles.patientSummaryListItemText}>
                            {getDisplayString(allergy)}
                          </Text>
                          <Group mt={2} gap={4}>
                            {allergy.clinicalStatus?.coding?.[0]?.code && (
                              <Badge
                                size="xs"
                                color={getClinicalStatusColor(allergy.clinicalStatus.coding[0].code)}
                                variant="light"
                                className={styles.patientSummaryBadge}
                              >
                                {allergy.clinicalStatus.coding[0].code}
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
                              <IconChevronRight size={16} stroke={2.5} />
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
      </Box>
      <Modal opened={opened} onClose={close} title={editAllergy ? 'Edit Allergy' : 'Add Allergy'}>
        <AllergyDialog patient={patient} encounter={encounter} allergy={editAllergy} onSubmit={handleSubmit} />
      </Modal>
    </>
  );
}

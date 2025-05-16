import { ActionIcon, Badge, Box, Collapse, Flex, Group, Modal, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatDate } from '@medplum/core';
import { Goal, Patient, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconChevronDown, IconChevronRight, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { killEvent } from '../utils/dom';
import { GoalDialog } from './GoalDialog';
import styles from './PatientSummary.module.css';

export interface GoalsProps {
  readonly patient: Patient;
  readonly goals: Goal[];
  readonly onClickResource?: (resource: Resource) => void;
}

function getStatusColor(status?: string): string {
  switch (status) {
    case 'active':
      return 'green';
    case 'on-hold':
      return 'yellow';
    case 'completed':
      return 'blue';
    case 'cancelled':
      return 'red';
    case 'entered-in-error':
      return 'gray';
    default:
      return 'gray';
  }
}

export function Goals(props: GoalsProps): JSX.Element {
  const medplum = useMedplum();
  const { goals: propsGoals, patient } = props;
  const [goals, setGoals] = useState<Goal[]>(propsGoals);
  const [editGoal, setEditGoal] = useState<Goal>();
  const [opened, { open, close }] = useDisclosure(false);
  const [collapsed, setCollapsed] = useState(false);
  const [overflowedGoals, setOverflowedGoals] = useState<Record<string, boolean>>({});
  const textRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  // Sort by start date descending
  const sortedGoals = [...goals].sort((a, b) => {
    const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
    const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
    return dateB - dateA;
  });

  useEffect(() => {
    // Check for overflow on all goals
    Object.entries(textRefs.current).forEach(([id, el]) => {
      if (el) {
        setOverflowedGoals((prev) => ({
          ...prev,
          [id]: el.scrollWidth > el.clientWidth,
        }));
      }
    });
  }, [goals]);

  const handleSubmit = useCallback(
    async (goal: Goal) => {
      try {
        if (goal.id) {
          const updatedGoal = await medplum.updateResource(goal);
          setGoals(goals.map((g) => (g.id === updatedGoal.id ? updatedGoal : g)));
        } else {
          const newGoal = await medplum.createResource(goal);
          setGoals([newGoal, ...goals]);
        }
        setEditGoal(undefined);
        close();
      } catch (error) {
        console.error('Error saving goal:', error);
      }
    },
    [medplum, goals, close]
  );

  // Helper function to handle click on a goal
  const handleGoalClick = useCallback(
    (goal: Goal, e?: React.MouseEvent) => {
      if (e) {
        killEvent(e);
      }

      // Always open the edit modal
      setEditGoal(goal);
      open();
    },
    [open]
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
                aria-label={collapsed ? 'Show goals' : 'Hide goals'}
                className={`${styles.patientSummaryCollapseIcon} ${collapsed ? styles.collapsed : ''}`}
                size="md"
              >
                <IconChevronDown size={20} />
              </ActionIcon>
              <Text fz="md" fw={800} onClick={() => setCollapsed((c) => !c)}>
                Goals
              </Text>
            </Group>
            <ActionIcon
              className={`${styles.patientSummaryAddButton} add-button`}
              variant="subtle"
              onClick={(e) => {
                killEvent(e);
                setEditGoal(undefined);
                open();
              }}
              size="md"
            >
              <IconPlus size={18} />
            </ActionIcon>
          </Group>
        </UnstyledButton>
        <Collapse in={!collapsed}>
          {sortedGoals.length > 0 ? (
            <Box ml="36" mt="8" mb="16">
              <Flex direction="column" gap={8}>
                {sortedGoals.map((goal) => {
                  const description = goal.description?.text || 'No description';
                  return (
                    <Box
                      key={goal.id}
                      className={styles.patientSummaryListItem}
                      onClick={(e) => handleGoalClick(goal, e)}
                    >
                      <Tooltip
                        label={description}
                        position="top-start"
                        openDelay={650}
                        disabled={!overflowedGoals[goal.id || '']}
                      >
                        <Box style={{ position: 'relative' }}>
                          <Text
                            size="sm"
                            className={styles.patientSummaryListItemText}
                            style={{ fontWeight: 500, width: '100%' }}
                          >
                            <span
                              ref={(el) => {
                                if (el) {
                                  textRefs.current[goal.id || ''] = el;
                                }
                              }}
                              style={{
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                width: '100%',
                                display: 'block',
                              }}
                            >
                              {description}
                            </span>
                          </Text>
                          <Group gap={8} align="center">
                            {goal.lifecycleStatus && (
                              <Badge
                                size="xs"
                                color={getStatusColor(goal.lifecycleStatus)}
                                variant="light"
                                className={styles.patientSummaryBadge}
                              >
                                {goal.lifecycleStatus}
                              </Badge>
                            )}
                            {goal.startDate && (
                              <Text size="xs" fw={500} color="gray.6">
                                {formatDate(goal.startDate)}
                              </Text>
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
      <style>{`
        .mantine-UnstyledButton-root:hover .add-button {
          opacity: 1 !important;
        }
      `}</style>
      <Modal opened={opened} onClose={close} title={editGoal ? 'Edit Goal' : 'Add Goal'}>
        <GoalDialog patient={patient} goal={editGoal} onSubmit={handleSubmit} onClose={close} />
      </Modal>
    </>
  );
}

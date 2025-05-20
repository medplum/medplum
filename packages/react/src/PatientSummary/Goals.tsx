import { Box, Group, Text, Collapse, ActionIcon, UnstyledButton, Flex, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Goal, Patient, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useState, useCallback, JSX } from 'react';
import { formatDate } from '@medplum/core';
import { IconChevronDown, IconPlus } from '@tabler/icons-react';
import { killEvent } from '../utils/dom';
import styles from './PatientSummary.module.css';
import { GoalDialog } from './GoalDialog';
import SummaryItem from './SummaryItem';

export interface GoalsProps {
  readonly patient: Patient;
  readonly goals: Goal[];
  readonly onClickResource?: (resource: Resource) => void;
}

export function Goals(props: GoalsProps): JSX.Element {
  const { goals: propsGoals, patient } = props;
  const medplum = useMedplum();
  const [goals, setGoals] = useState<Goal[]>(propsGoals);
  const [editGoal, setEditGoal] = useState<Goal>();
  const [opened, { open, close }] = useDisclosure(false);
  const [collapsed, setCollapsed] = useState(false);

  // Sort by start date descending
  const sortedGoals = [...goals].sort((a, b) => {
    const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
    const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
    return dateB - dateA;
  });

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
                {sortedGoals.map((goal) => (
                  <SummaryItem
                    key={goal.id}
                    title={goal.description?.text || 'No description'}
                    subtitle={formatDate(goal.startDate)}
                    color={getStatusColor(goal.lifecycleStatus)}
                    onClick={() => {
                      setEditGoal(goal);
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
      <Modal 
        opened={opened} 
        onClose={close} 
        title={editGoal ? 'Edit Goal' : 'Add Goal'}
      >
        <GoalDialog 
          patient={patient} 
          goal={editGoal} 
          onSubmit={handleSubmit} 
          onClose={close}
        />
      </Modal>
    </>
  );
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
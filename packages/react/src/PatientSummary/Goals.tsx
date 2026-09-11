// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatCodeableConcept, formatDate } from '@medplum/core';
import type { Goal, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { CollapsibleSection } from './CollapsibleSection';
import { GoalDialog } from './GoalDialog';
import { isEnteredInError } from './PatientSummary.utils';
import SummaryItem from './SummaryItem';
import styles from './SummaryItem.module.css';

export interface GoalsProps {
  readonly patient: Patient;
  readonly goals: Goal[];
}

export function Goals(props: GoalsProps): JSX.Element {
  const medplum = useMedplum();
  const { patient } = props;
  const [goals, setGoals] = useState(props.goals);
  const [opened, { open, close }] = useDisclosure(false);
  const [editGoal, setEditGoal] = useState<Goal>();

  const handleSubmit = useCallback(
    async (goal: Goal) => {
      if (goal.id) {
        const updated = await medplum.updateResource(goal);
        setGoals(goals.map((g) => (g.id === updated.id ? updated : g)));
      } else {
        const created = await medplum.createResource(goal);
        setGoals([created, ...goals]);
      }
      setEditGoal(undefined);
      close();
    },
    [medplum, goals, close]
  );

  // Hide entered-in-error goals (still reachable by direct URL).
  const visibleGoals = goals.filter((goal) => !isEnteredInError(goal));

  const handleDelete = useCallback(async () => {
    if (!editGoal?.id) {
      return;
    }
    await medplum.deleteResource('Goal', editGoal.id);
    setGoals(goals.filter((g) => g.id !== editGoal.id));
    setEditGoal(undefined);
    close();
  }, [medplum, goals, editGoal, close]);

  return (
    <>
      <CollapsibleSection
        title="Goals"
        onAdd={() => {
          setEditGoal(undefined);
          open();
        }}
      >
        {visibleGoals.length > 0 ? (
          <Flex direction="column" gap={8}>
            {visibleGoals.map((goal) => (
              <SummaryItem
                key={goal.id}
                onClick={() => {
                  setEditGoal(goal);
                  open();
                }}
              >
                <Box>
                  <Text fw={500} className={styles.itemText}>
                    {getGoalDisplay(goal)}
                  </Text>
                  <Group mt={2} gap={4}>
                    {goal.lifecycleStatus && (
                      <StatusBadge
                        color={getGoalStatusColor(goal.lifecycleStatus)}
                        variant="light"
                        status={goal.lifecycleStatus}
                      />
                    )}
                    {getGoalDateText(goal) && (
                      <Text size="xs" fw={500} c="dimmed">
                        {getGoalDateText(goal)}
                      </Text>
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
      {/* Mounted only while open so every open is a fresh instance, with no leftover form state. */}
      {opened && (
        <GoalDialog
          patient={patient}
          goal={editGoal}
          opened={opened}
          onClose={close}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}

function getGoalDisplay(goal: Goal): string {
  return (goal.description && formatCodeableConcept(goal.description)) || 'Goal';
}

function getGoalDateText(goal: Goal): string | undefined {
  const dueDate = goal.target?.find((target) => target.dueDate)?.dueDate;
  if (dueDate) {
    return `Target ${formatDate(dueDate)}`;
  }
  return goal.startDate ? `Started ${formatDate(goal.startDate)}` : undefined;
}

function getGoalStatusColor(status: string): string {
  switch (status) {
    case 'active':
    case 'accepted':
    case 'completed':
      return 'green';
    case 'on-hold':
    case 'planned':
    case 'proposed':
      return 'yellow';
    case 'cancelled':
    case 'rejected':
    case 'entered-in-error':
      return 'red';
    default:
      return 'gray';
  }
}

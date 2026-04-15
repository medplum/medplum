// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Box, Flex, Group, Modal, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatDate, getDisplayString } from '@medplum/core';
import type { Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { CollapsibleSection } from './CollapsibleSection';
import { ConditionDialog } from './ConditionDialog';
import SummaryItem from './SummaryItem';
import styles from './SummaryItem.module.css';

export interface ProblemListProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly problems: Condition[];
  readonly onClickResource?: (resource: Condition) => void;
}

function getCodeKey(condition: Condition): string | undefined {
  const coding = condition.code?.coding?.[0];
  if (coding?.system && coding?.code) {
    return `${coding.system}|${coding.code}`;
  }
  if (coding?.code) {
    return coding.code;
  }
  return condition.code?.text ?? condition.id;
}

export function ProblemList(props: ProblemListProps): JSX.Element {
  const medplum = useMedplum();
  const { patient, encounter } = props;
  const [problems, setProblems] = useState(
    props.problems.filter((c) => c.verificationStatus?.coding?.[0]?.code !== 'entered-in-error')
  );
  const [editCondition, setEditCondition] = useState<Condition>();
  const [opened, { open, close }] = useDisclosure(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

  const groupedProblems = useMemo(() => {
    const groups = new Map<string, Condition[]>();
    for (let i = 0; i < problems.length; i++) {
      const problem = problems[i];
      const key = getCodeKey(problem) ?? `ungrouped-${i}`;
      const existing = groups.get(key);
      if (existing) {
        existing.push(problem);
      } else {
        groups.set(key, [problem]);
      }
    }
    return Array.from(groups.entries());
  }, [problems]);

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (condition: Condition) => {
      if (condition.id) {
        const updatedCondition = await medplum.updateResource(condition);
        setProblems(problems.map((p) => (p.id === updatedCondition.id ? updatedCondition : p)));
      } else {
        const newCondition = await medplum.createResource(condition);
        setProblems([newCondition, ...problems]);
      }
      setEditCondition(undefined);
      close();
    },
    [medplum, problems, close]
  );

  return (
    <>
      <CollapsibleSection
        title="Problems"
        onAdd={() => {
          setEditCondition(undefined);
          open();
        }}
      >
        {problems.length > 0 ? (
          <Flex direction="column" gap={8}>
            {groupedProblems.map(([key, group], groupIndex) => {
              const isExpanded = expandedGroups.has(key);
              const displayProblems = isExpanded ? group : [group[0]];
              const groupContentId = `problem-group-content-${groupIndex}`;
              return (
                <Box key={key}>
                  <Flex direction="column" gap={4} id={groupContentId}>
                    {displayProblems.map((problem) => (
                      <SummaryItem
                        key={problem.id}
                        onClick={() => {
                          setEditCondition(problem);
                          open();
                        }}
                      >
                        <Box>
                          <Group gap={6} wrap="nowrap">
                            <Text fw={500} className={styles.itemText}>
                              {getDisplayString(problem)}
                            </Text>
                            {!isExpanded && group.length > 1 && (
                              <Badge size="xs" color="gray" variant="light" style={{ flexShrink: 0 }}>
                                +{group.length - 1}
                              </Badge>
                            )}
                          </Group>
                          <Group mt={2} gap={4}>
                            {problem.clinicalStatus?.coding?.[0]?.code && (
                              <StatusBadge
                                data-testid="status-badge"
                                color={getStatusColor(problem.clinicalStatus?.coding?.[0]?.code)}
                                variant="light"
                                status={problem.clinicalStatus?.coding?.[0]?.code}
                              />
                            )}
                            <Text size="xs" fw={500} c="dimmed">
                              {formatDate(problem.onsetDateTime)}
                            </Text>
                          </Group>
                        </Box>
                      </SummaryItem>
                    ))}
                  </Flex>
                  {group.length > 1 && (
                    <UnstyledButton
                      onClick={() => toggleGroup(key)}
                      aria-expanded={isExpanded}
                      aria-controls={groupContentId}
                      pl={4}
                      pt={2}
                      style={{ fontSize: 'var(--mantine-font-size-xs)', color: 'var(--mantine-color-dimmed)' }}
                    >
                      {isExpanded ? 'Show less' : `Show all ${group.length} entries`}
                    </UnstyledButton>
                  )}
                </Box>
              );
            })}
          </Flex>
        ) : (
          <Text>(none)</Text>
        )}
      </CollapsibleSection>
      <Modal opened={opened} onClose={close} title={editCondition ? 'Edit Problem' : 'Add Problem'}>
        <ConditionDialog patient={patient} encounter={encounter} condition={editCondition} onSubmit={handleSubmit} />
      </Modal>
    </>
  );
}

const getStatusColor = (status?: string): string => {
  if (!status) {
    return 'gray';
  }

  switch (status) {
    case 'active':
    case 'recurrence':
    case 'relapse':
      return 'green';
    case 'inactive':
      return 'orange';
    case 'remission':
      return 'blue';
    case 'resolved':
      return 'teal';
    default:
      return 'gray';
  }
};

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex, Group, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatDate, getDisplayString } from '@medplum/core';
import { Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { JSX, useCallback, useState } from 'react';
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

export function ProblemList(props: ProblemListProps): JSX.Element {
  const medplum = useMedplum();
  const { patient, encounter } = props;
  const [problems, setProblems] = useState<Condition[]>(
    props.problems.filter((c) => c.verificationStatus?.coding?.[0]?.code !== 'entered-in-error')
  );
  const [editCondition, setEditCondition] = useState<Condition>();
  const [opened, { open, close }] = useDisclosure(false);

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
            {problems.map((problem) => (
              <SummaryItem
                key={problem.id}
                onClick={() => {
                  setEditCondition(problem);
                  open();
                }}
              >
                <Box>
                  <Text fw={500} className={styles.itemText}>
                    {getDisplayString(problem)}
                  </Text>
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

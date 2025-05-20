import { ActionIcon, Box, Collapse, Flex, Group, Modal, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatDate, getDisplayString } from '@medplum/core';
import { Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconChevronDown, IconPlus, IconStackForward } from '@tabler/icons-react';
import { JSX, useCallback, useState } from 'react';
import { killEvent } from '../utils/dom';
import { ConditionDialog } from './ConditionDialog';
import styles from './PatientSummary.module.css';
import SummaryItem from './SummaryItem';

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
  const [collapsed, setCollapsed] = useState(false);

  const handleSubmit = useCallback(
    async (condition: Condition) => {
      try {
        if (condition.id) {
          const updatedCondition = await medplum.updateResource(condition);
          setProblems(problems.map((p) => (p.id === updatedCondition.id ? updatedCondition : p)));
        } else {
          const newCondition = await medplum.createResource(condition);
          setProblems([newCondition, ...problems]);
        }
      } catch (error) {
        console.error('Error saving condition:', error);
      } finally {
        setEditCondition(undefined);
        close();
      }
    },
    [medplum, problems, close]
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
                aria-label={collapsed ? 'Show problems' : 'Hide problems'}
                className={`${styles.patientSummaryCollapseIcon} ${collapsed ? styles.collapsed : ''}`}
                size="md"
              >
                <IconChevronDown size={20} />
              </ActionIcon>
              <Text fz="md" fw={800} onClick={() => setCollapsed((c) => !c)}>
                Problem List
              </Text>
            </Group>
            <ActionIcon
              className={`${styles.patientSummaryAddButton} add-button`}
              variant="subtle"
              onClick={(e) => {
                killEvent(e);
                setEditCondition(undefined);
                open();
              }}
              size="md"
            >
              <IconPlus size={18} />
            </ActionIcon>
          </Group>
        </UnstyledButton>
        <Collapse in={!collapsed}>
          {problems.length > 0 ? (
            <Box ml="36" mt="8" mb="16">
              <Flex direction="column" gap={8}>
                {problems.map((problem) => (
                  <SummaryItem
                    key={problem.id}
                    title={getDisplayString(problem)}
                    subtitle={formatDate(problem.onsetDateTime)}
                    status={problem.clinicalStatus?.coding?.[0]?.code}
                    color={getStatusColor(problem.clinicalStatus?.coding?.[0]?.code)}
                    onClick={() => {
                      setEditCondition(problem);
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
      <style>{`
        .mantine-UnstyledButton-root:hover .add-button {
          opacity: 1 !important;
        }
      `}</style>
      <Modal opened={opened} onClose={close} withCloseButton={false} title={null}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <span style={{ fontWeight: 700 }}>{editCondition ? 'Edit Problem' : 'Add Problem'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {editCondition?.id && (
              <Tooltip label="X-ray" position="top">
                <ActionIcon
                  variant="subtle"
                  onClick={() => {
                    close();
                    // navigate(`/Patient/${patient.id}/Condition/${editCondition.id}/edit`);
                  }}
                  aria-label="X-ray"
                >
                  <span style={{ color: '#868e96' }}>
                    <IconStackForward size={22} />
                  </span>
                </ActionIcon>
              </Tooltip>
            )}
            <ActionIcon variant="subtle" onClick={close} aria-label="Close">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#868e96"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </ActionIcon>
          </div>
        </div>
        <ConditionDialog
          patient={patient}
          encounter={encounter}
          condition={editCondition}
          onSubmit={handleSubmit}
          onClose={close}
        />
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

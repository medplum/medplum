import { ActionIcon, Badge, Box, Collapse, Flex, Group, Modal, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatDate, getDisplayString } from '@medplum/core';
import { Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconChevronDown, IconChevronRight, IconPlus, IconStackForward } from '@tabler/icons-react';
import { JSX, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { killEvent } from '../utils/dom';
import { ConditionDialog } from './ConditionDialog';
import styles from './PatientSummary.module.css';

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
  const navigate = useNavigate();

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
        setEditCondition(undefined);
        close();
      } catch (error) {
        console.error('Error saving condition:', error);
      }
    },
    [medplum, problems, close]
  );

  // Helper function to handle click on a problem
  const handleProblemClick = useCallback(
    (problem: Condition, e?: React.MouseEvent) => {
      if (e) {
        killEvent(e);
      }

      // Always open the edit modal
      setEditCondition(problem);
      open();
    },
    [open]
  );

  // Helper function to get status badge color
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
                  <ProblemRow
                    key={problem.id}
                    problem={problem}
                    handleProblemClick={handleProblemClick}
                    getStatusColor={getStatusColor}
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
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    navigate(`/Patient/${patient.id}/Condition/${editCondition.id}/edit`);
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

interface ProblemRowProps {
  problem: Condition;
  handleProblemClick: (problem: Condition, e?: React.MouseEvent) => void;
  getStatusColor: (status?: string) => string;
}

function ProblemRow({ problem, handleProblemClick, getStatusColor }: ProblemRowProps): JSX.Element {
  const [isOverflowed, setIsOverflowed] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = textRef.current;
    if (el) {
      setIsOverflowed(el.scrollWidth > el.clientWidth);
    }
  }, [problem]);
  return (
    <Box className={styles.patientSummaryListItem} onClick={(e) => handleProblemClick(problem, e)}>
      <Tooltip label={getDisplayString(problem)} position="top-start" openDelay={650} disabled={!isOverflowed}>
        <Box style={{ position: 'relative' }}>
          <Text ref={textRef} size="sm" className={styles.patientSummaryListItemText}>
            {getDisplayString(problem)}
          </Text>
          <Group mt={2} gap={4}>
            {problem.clinicalStatus?.coding?.[0]?.code && (
              <Badge
                size="xs"
                color={getStatusColor(problem.clinicalStatus.coding[0].code)}
                variant="light"
                className={styles.patientSummaryBadge}
              >
                {problem.clinicalStatus.coding[0].code}
              </Badge>
            )}
            {problem.onsetDateTime && (
              <Text size="xs" fw={500} color="gray.6">
                {formatDate(problem.onsetDateTime)}
              </Text>
            )}
          </Group>
          <div className={styles.patientSummaryGradient} />
          <div className={styles.patientSummaryChevronContainer}>
            <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
              <IconChevronRight size={16} stroke={2.5} />
            </ActionIcon>
          </div>
        </Box>
      </Tooltip>
    </Box>
  );
}

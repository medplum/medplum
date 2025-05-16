import { Box, Group, Text, Collapse, ActionIcon, UnstyledButton, Flex, Badge, Tooltip, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Procedure, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useState, useRef, useEffect, useCallback, JSX } from 'react';
import { IconChevronDown, IconPlus, IconChevronRight } from '@tabler/icons-react';
import { formatDate } from '@medplum/core';
import styles from './PatientSummary.module.css';
import { killEvent } from '../utils/dom';
import { ProcedureDialog } from './ProcedureDialog';

// Helper function to get status badge color
const getStatusColor = (status?: string): string => {
  if (!status) { return 'gray'; }
  switch (status) {
    case 'completed':
      return 'green';
    case 'in-progress':
      return 'blue';
    case 'not-done':
      return 'red';
    case 'entered-in-error':
      return 'orange';
    case 'unknown':
      return 'gray';
    default:
      return 'gray';
  }
};

export interface ProceduresProps {
  readonly patient: Patient;
  readonly procedures: Procedure[];
  readonly onClickResource?: (resource: Procedure) => void;
}

// TODO: new file
function ProcedureItem({ procedure, onEdit }: { procedure: Procedure; onEdit: (procedure: Procedure) => void }): JSX.Element {
  const [isOverflowed, setIsOverflowed] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const el = textRef.current;
    if (el) {
      setIsOverflowed(el.scrollWidth > el.clientWidth);
    }
  }, [procedure]);

  const displayText = procedure.code?.coding?.[0]?.display || procedure.code?.text || 'Unknown Procedure';

  return (
    <Box
      key={procedure.id}
      className={styles.patientSummaryListItem}
      onClick={() => onEdit(procedure)}
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
            {procedure.status && (
              <Badge 
                size="xs" 
                color={getStatusColor(procedure.status)} 
                variant="light" 
                className={styles.patientSummaryBadge}
              >
                {procedure.status}
              </Badge>
            )}
            {procedure.performedDateTime && (
              <Text size="xs" fw={500} color="gray.6">
                {formatDate(procedure.performedDateTime)}
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
              <IconChevronRight size={16} stroke={2.5}/>
            </ActionIcon>
          </div>
        </Box>
      </Tooltip>
    </Box>
  );
}

export function Procedures(props: ProceduresProps): JSX.Element {
  const medplum = useMedplum();
  const [procedures, setProcedures] = useState<Procedure[]>(props.procedures);
  const [editProcedure, setEditProcedure] = useState<Procedure>();
  const [opened, { open, close }] = useDisclosure(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleSubmit = useCallback(
    async (procedure: Procedure) => {
      if (procedure.id) {
        const updatedProcedure = await medplum.updateResource(procedure);
        setProcedures(procedures.map((p) => (p.id === updatedProcedure.id ? updatedProcedure : p)));
      } else {
        const newProcedure = await medplum.createResource(procedure);
        setProcedures([newProcedure, ...procedures]);
      }
      setEditProcedure(undefined);
      close();
    },
    [medplum, procedures, close]
  );

  // Sort procedures by performed date, most recent first
  const sortedProcedures = [...procedures].sort((a, b) => {
    const dateA = a.performedDateTime ? new Date(a.performedDateTime).getTime() : 0;
    const dateB = b.performedDateTime ? new Date(b.performedDateTime).getTime() : 0;
    return dateB - dateA;
  });

  

  return (
    <>
      <Box style={{ position: 'relative' }}>
        <UnstyledButton className={styles.patientSummaryHeader}>
          <Group justify="space-between">
            <Group gap={8}>
              <ActionIcon
                variant="subtle"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? 'Show procedures' : 'Hide procedures'}
                className={`${styles.patientSummaryCollapseIcon} ${collapsed ? styles.collapsed : ''}`}
                size="md"
              >
                <IconChevronDown size={20} />
              </ActionIcon>
              <Text 
                fz="md" 
                fw={800} 
                onClick={() => setCollapsed((c) => !c)}
              >
                Procedures
              </Text>
            </Group>
            <ActionIcon
              className={`${styles.patientSummaryAddButton} add-button`}
              variant="subtle"
              onClick={(e) => {
                killEvent(e);
                setEditProcedure(undefined);
                open();
              }}
              size="md"
            >
              <IconPlus size={18} />
            </ActionIcon>
          </Group>
        </UnstyledButton>
        <Collapse in={!collapsed}>
          {sortedProcedures.length > 0 ? (
            <Box ml="36" mt="8" mb="16">
              <Flex direction="column" gap={8}>
                {sortedProcedures.map((procedure) => (
                  <ProcedureItem 
                    key={procedure.id}
                    procedure={procedure}
                    onEdit={(procedure) => {
                      setEditProcedure(procedure);
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
      <Modal opened={opened} onClose={close} title={editProcedure ? 'Edit Procedure' : 'Add Procedure'}>
        <ProcedureDialog
          patient={props.patient}
          procedure={editProcedure}
          onSubmit={handleSubmit}
        />
      </Modal>
    </>
  );
} 
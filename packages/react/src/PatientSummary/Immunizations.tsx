import { ActionIcon, Box, Collapse, Flex, Group, Text, UnstyledButton } from '@mantine/core';
import { formatDate } from '@medplum/core';
import { Immunization, Patient, Resource } from '@medplum/fhirtypes';
import { IconChevronDown } from '@tabler/icons-react';
import { JSX, useState } from 'react';
import styles from './PatientSummary.module.css';
import SummaryItem from './SummaryItem';

export interface ImmunizationsProps {
  readonly patient: Patient;
  readonly immunizations: Immunization[];
  readonly onClickResource?: (resource: Resource) => void;
}

export function Immunizations(props: ImmunizationsProps): JSX.Element {
  const { immunizations } = props;
  const [collapsed, setCollapsed] = useState(false);

  // Sort by occurrence date descending and filter out 'entered-in-error'
  const sortedImmunizations = [...immunizations]
    .filter((imm) => imm.status !== 'entered-in-error')
    .sort((a, b) => {
      const dateA = a.occurrenceDateTime ? new Date(a.occurrenceDateTime).getTime() : 0;
      const dateB = b.occurrenceDateTime ? new Date(b.occurrenceDateTime).getTime() : 0;
      return dateB - dateA;
    });

  return (
    <Box style={{ position: 'relative' }}>
      <UnstyledButton className={styles.patientSummaryHeader}>
        <Group justify="space-between">
          <Group gap={8}>
            <ActionIcon
              variant="subtle"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Show immunizations' : 'Hide immunizations'}
              className={`${styles.patientSummaryCollapseIcon} ${collapsed ? styles.collapsed : ''}`}
              size="md"
            >
              <IconChevronDown size={20} />
            </ActionIcon>
            <Text fz="md" fw={800} onClick={() => setCollapsed((c) => !c)}>
              Immunizations
            </Text>
          </Group>
        </Group>
      </UnstyledButton>
      <Collapse in={!collapsed}>
        {sortedImmunizations.length > 0 ? (
          <Box ml="36" mt="8" mb="16">
            <Flex direction="column" gap={8}>
              {sortedImmunizations.map((imm) => (
                <SummaryItem
                  key={imm.id}
                  title={imm.vaccineCode?.coding?.[0]?.display || 'Unknown Vaccine'}
                  subtitle={formatDate(imm.occurrenceDateTime)}
                  color={getStatusColor(imm.status)}
                  onClick={() => {}}
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
  );
}

function getStatusColor(status?: string): string {
  switch (status) {
    case 'completed':
      return 'green';
    case 'entered-in-error':
      return 'orange';
    case 'not-done':
      return 'red';
    default:
      return 'gray';
  }
}

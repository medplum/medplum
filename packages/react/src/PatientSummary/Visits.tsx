import { ActionIcon, Box, Collapse, Flex, Group, Text, UnstyledButton } from '@mantine/core';
import { Appointment, Encounter, Patient } from '@medplum/fhirtypes';
import { IconChevronDown } from '@tabler/icons-react';
import { useState, JSX } from 'react';
import styles from './PatientSummary.module.css';
import SummaryItem from './SummaryItem';
import { formatDate } from '@medplum/core';

export interface VisitsProps {
  readonly patient: Patient;
  readonly appointments: Appointment[];
  readonly encounters?: Encounter[];
  readonly onClickResource?: (resource: Appointment) => void;
}

export function Visits(props: VisitsProps): JSX.Element {
  const { appointments } = props;
  const [collapsed, setCollapsed] = useState(false);

  // Sort appointments by start date, most recent first
  const sortedAppointments = [...appointments].sort((a, b) => {
    const dateA = a.start ? new Date(a.start).getTime() : 0;
    const dateB = b.start ? new Date(b.start).getTime() : 0;
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
              aria-label={collapsed ? 'Show visits' : 'Hide visits'}
              className={`${styles.patientSummaryCollapseIcon} ${collapsed ? styles.collapsed : ''}`}
              size="md"
            >
              <IconChevronDown size={20} />
            </ActionIcon>
            <Text fz="md" fw={800} onClick={() => setCollapsed((c) => !c)}>
              Visits
            </Text>
          </Group>
        </Group>
      </UnstyledButton>
      <Collapse in={!collapsed}>
        {sortedAppointments.length > 0 ? (
          <Box ml="36" mt="8" mb="16">
            <Flex direction="column" gap={8}>
              {sortedAppointments.map((appt) => {
                const practitioner = appt.participant?.find((p) => p.actor?.reference?.startsWith('Practitioner'));
                return (
                  <SummaryItem
                    title={formatDateTime(appt.start)}
                    subtitle={practitioner?.actor?.display}
                    color={getStatusColor(appt.status)}
                    onClick={() => {
                      props.onClickResource?.(appt);
                    }}
                  />
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
  );
}


const getStatusColor = (status?: string): string => {
  if (!status) {
    return 'gray';
  }

  switch (status) {
    case 'booked':
      return 'blue';
    case 'arrived':
      return 'green';
    case 'fulfilled':
      return 'teal';
    case 'cancelled':
      return 'red';
    case 'noshow':
      return 'orange';
    case 'pending':
      return 'yellow';
    case 'proposed':
      return 'gray';
    default:
      return 'gray';
  }
};


function formatDateTime(dateString?: string): string {
  if (!dateString) {
    return 'No date';
  }
  const date = new Date(dateString);
  return `${formatDate(dateString)} · ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  })}`;
}
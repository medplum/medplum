import { ActionIcon, Badge, Box, Collapse, Flex, Group, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { formatDate, resolveId } from '@medplum/core';
import { Appointment, Encounter, Patient } from '@medplum/fhirtypes';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import styles from './PatientSummary.module.css';

export interface VisitsProps {
  readonly patient: Patient;
  readonly appointments: Appointment[];
  readonly encounters?: Encounter[];
  readonly onClickResource?: (resource: Appointment) => void;
}

export function Visits(props: VisitsProps): JSX.Element {
  const { patient, appointments, encounters = [] } = props;
  const [collapsed, setCollapsed] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Sort appointments by start date, most recent first
  const sortedAppointments = [...appointments].sort((a, b) => {
    const dateA = a.start ? new Date(a.start).getTime() : 0;
    const dateB = b.start ? new Date(b.start).getTime() : 0;
    return dateB - dateA;
  });

  // Helper function to get status badge color
  const getStatusColor = (status?: string): string => {
    if (!status) return 'gray';
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

  // Helper to find associated Encounter for an Appointment
  function findEncounterForAppointment(appointment: Appointment): Encounter | undefined {
    const appointmentRef = `Appointment/${appointment.id}`;
    return encounters.find((enc) => {
      if (Array.isArray(enc.appointment)) {
        return enc.appointment.some((a: any) => a && typeof a.reference === 'string' && a.reference === appointmentRef);
      }
      if (enc.appointment && typeof enc.appointment === 'object' && 'reference' in enc.appointment) {
        return (enc.appointment as any).reference === appointmentRef;
      }
      return false;
    });
  }

  // Helper to format date and time
  function formatDateTime(dateString?: string): string {
    if (!dateString) return 'No date';
    const date = new Date(dateString);
    return `${formatDate(dateString)} · ${date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    })}`;
  }

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
              {sortedAppointments.map((appt, index) => {
                const practitioner = appt.participant?.find((p) => p.actor?.reference?.startsWith('Practitioner'));
                const practitionerName = practitioner?.actor?.display || 'No provider';
                const encounter = findEncounterForAppointment(appt);
                const patientId = resolveId(patient);
                const encounterUrl = encounter ? `/Patient/${patientId}/Encounter/${encounter.id}/chart` : undefined;

                // Truncation and tooltip logic for date/time
                const [isOverflowed, setIsOverflowed] = useState(false);
                const textRef = useRef<HTMLSpanElement>(null);
                useEffect(() => {
                  const el = textRef.current;
                  if (el) {
                    setIsOverflowed(el.scrollWidth > el.clientWidth);
                  }
                }, [appt]);
                const dateTimeText = formatDateTime(appt.start);

                return (
                  <MedplumLink
                    key={appt.id}
                    to={encounterUrl}
                    style={{ textDecoration: 'none', display: 'block', color: 'black' }}
                  >
                    <Box
                      className={styles.patientSummaryListItem}
                      onMouseEnter={() => setHoverIndex(index)}
                      onMouseLeave={() => setHoverIndex(null)}
                      style={{ cursor: encounterUrl ? 'pointer' : 'default' }}
                    >
                      <Tooltip label={dateTimeText} position="top-start" openDelay={650} disabled={!isOverflowed}>
                        <Box style={{ position: 'relative' }}>
                          <Text
                            size="sm"
                            className={styles.patientSummaryListItemText}
                            style={{
                              fontWeight: 500,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              width: '100%',
                            }}
                          >
                            <span ref={textRef}>{dateTimeText}</span>
                          </Text>
                          <Group mt={2} gap={4}>
                            {appt.status && (
                              <Badge
                                size="xs"
                                color={getStatusColor(appt.status)}
                                variant="light"
                                className={styles.patientSummaryBadge}
                              >
                                {appt.status}
                              </Badge>
                            )}
                            <Text size="xs" fw={500} color="gray.6">
                              {practitionerName}
                            </Text>
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
                  </MedplumLink>
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

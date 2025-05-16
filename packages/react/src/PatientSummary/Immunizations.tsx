import { ActionIcon, Badge, Box, Collapse, Flex, Group, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { formatDate, resolveId } from '@medplum/core';
import { Immunization, Patient, Resource } from '@medplum/fhirtypes';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import styles from './PatientSummary.module.css';

export interface ImmunizationsProps {
  readonly patient: Patient;
  readonly immunizations: Immunization[];
  readonly onClickResource?: (resource: Resource) => void;
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

export function Immunizations(props: ImmunizationsProps): JSX.Element {
  const { immunizations, onClickResource, patient } = props;
  const [collapsed, setCollapsed] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Sort by occurrence date descending and filter out 'entered-in-error'
  const sortedImmunizations = [...immunizations]
    .filter((imm) => imm.status !== 'entered-in-error')
    .sort((a, b) => {
      const dateA = a.occurrenceDateTime ? new Date(a.occurrenceDateTime).getTime() : 0;
      const dateB = b.occurrenceDateTime ? new Date(b.occurrenceDateTime).getTime() : 0;
      return dateB - dateA;
    });

  const patientId = resolveId(patient);

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
              {sortedImmunizations.map((imm, index) => {
                const [isOverflowed, setIsOverflowed] = useState(false);
                const textRef = useRef<HTMLSpanElement>(null);
                useEffect(() => {
                  const el = textRef.current;
                  if (el) {
                    setIsOverflowed(el.scrollWidth > el.clientWidth);
                  }
                }, [imm]);
                const vaccineName = (
                  imm.vaccineCode?.text ||
                  imm.vaccineCode?.coding?.[0]?.display ||
                  'Unknown Vaccine'
                ).replace(/^\w/, (c) => c.toUpperCase());
                return (
                  <MedplumLink
                    key={imm.id}
                    to={`/Patient/${patientId}/Immunization/${imm.id}`}
                    style={{ textDecoration: 'none', display: 'block', color: 'black' }}
                  >
                    <Tooltip label={vaccineName} position="top-start" openDelay={650} disabled={!isOverflowed}>
                      <Box
                        className={styles.patientSummaryListItem}
                        onMouseEnter={() => setHoverIndex(index)}
                        onMouseLeave={() => setHoverIndex(null)}
                        style={{ cursor: 'pointer' }}
                      >
                        <Text
                          size="sm"
                          className={styles.patientSummaryListItemText}
                          style={{ fontWeight: 500, width: '100%' }}
                        >
                          <span
                            ref={textRef}
                            style={{
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              width: '100%',
                              display: 'block',
                            }}
                          >
                            {vaccineName}
                          </span>
                        </Text>
                        <Group gap={8} align="center">
                          {imm.status && (
                            <Badge
                              size="xs"
                              color={getStatusColor(imm.status)}
                              variant="light"
                              className={styles.patientSummaryBadge}
                            >
                              {imm.status === 'not-done' ? 'Not done' : imm.status}
                            </Badge>
                          )}
                          {imm.occurrenceDateTime && (
                            <Text size="xs" fw={500} color="gray.6">
                              {imm.status === 'not-done' ? 'Expected: ' : ''}
                              {formatDate(imm.occurrenceDateTime)}
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
                            <IconChevronRight size={16} stroke={2.5} />
                          </ActionIcon>
                        </div>
                      </Box>
                    </Tooltip>
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

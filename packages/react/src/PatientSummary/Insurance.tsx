import { ActionIcon, Badge, Box, Collapse, Flex, Group, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import { Coverage, Patient, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import { IconChevronDown, IconChevronRight, IconPlus } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { killEvent } from '../utils/dom';
import styles from './PatientSummary.module.css';

export interface InsuranceProps {
  readonly patient: Patient;
  readonly coverages: Coverage[];
  readonly onClickResource?: (resource: Coverage) => void;
}

function PayorDisplay({ reference }: { reference?: Reference }): JSX.Element {
  const payor = useResource(reference);

  if (!payor) {
    return (
      <Text size="sm" fw={500}>
        Unknown Payor
      </Text>
    );
  }

  if ('name' in payor && typeof payor.name === 'string') {
    // Organization
    return (
      <Text size="sm" fw={500}>
        {payor.name}
      </Text>
    );
  } else if ('name' in payor && Array.isArray(payor.name) && payor.name.length > 0) {
    // Patient or RelatedPerson
    return (
      <Text size="sm" fw={500}>
        {formatHumanName(payor.name[0])}
      </Text>
    );
  }

  return (
    <Text size="sm" fw={500}>
      Unknown Payor
    </Text>
  );
}

// Helper to capitalize first letter of each word
function capitalizeWords(str: string): string {
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function Insurance(props: InsuranceProps): JSX.Element {
  const { patient, coverages, onClickResource } = props;
  const [collapsed, setCollapsed] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Filter to only show active coverages
  const activeCoverages = coverages.filter((coverage) => coverage.status === 'active');

  // Helper function to get status badge color
  const getStatusColor = (status?: string): string => {
    if (!status) return 'gray';
    switch (status) {
      case 'active':
        return 'green';
      case 'cancelled':
        return 'red';
      case 'draft':
        return 'yellow';
      case 'entered-in-error':
        return 'red';
      default:
        return 'gray';
    }
  };

  // Helper to format class information
  const formatClassInfo = (coverage: Coverage): string => {
    const classInfo = coverage.class
      ?.filter((cls) => cls.type?.coding?.[0]?.code !== 'plan')
      .map((cls) => {
        const type = cls.type?.coding?.[0]?.code || '';
        return `${capitalizeWords(type)}: ${cls.value}`;
      })
      .join(' · ');

    return classInfo || '';
  };

  // Helper function to handle click on a coverage
  const handleCoverageClick = (coverage: Coverage, e?: React.MouseEvent) => {
    if (e) {
      killEvent(e);
    }
    if (onClickResource) {
      onClickResource(coverage);
    }
  };

  return (
    <Box style={{ position: 'relative' }}>
      <UnstyledButton className={styles.patientSummaryHeader}>
        <Group justify="space-between">
          <Group gap={8}>
            <ActionIcon
              variant="subtle"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Show insurance' : 'Hide insurance'}
              className={`${styles.patientSummaryCollapseIcon} ${collapsed ? styles.collapsed : ''}`}
              size="md"
            >
              <IconChevronDown size={20} />
            </ActionIcon>
            <Text fz="md" fw={800} onClick={() => setCollapsed((c) => !c)}>
              Insurance
            </Text>
          </Group>
          <ActionIcon
            className={`${styles.patientSummaryAddButton} add-button`}
            variant="subtle"
            onClick={(e) => {
              killEvent(e);
              // TODO: Handle add new coverage
            }}
            size="md"
          >
            <IconPlus size={18} />
          </ActionIcon>
        </Group>
      </UnstyledButton>
      <Collapse in={!collapsed}>
        {activeCoverages.length > 0 ? (
          <Box ml="36" mt="8" mb="16">
            <Flex direction="column" gap={8}>
              {activeCoverages.map((coverage, index) => {
                const [isOverflowed, setIsOverflowed] = useState(false);
                const [isPayorOverflowed, setIsPayorOverflowed] = useState(false);
                const textRef = useRef<HTMLSpanElement>(null);
                const payorRef = useRef<HTMLSpanElement>(null);

                useEffect(() => {
                  const el = textRef.current;
                  if (el) {
                    setIsOverflowed(el.scrollWidth > el.clientWidth);
                  }
                  const payorEl = payorRef.current;
                  if (payorEl) {
                    setIsPayorOverflowed(payorEl.scrollWidth > payorEl.clientWidth);
                  }
                }, [coverage]);

                // Add logic to extract payorName as a string for the tooltip
                const payorResource = coverage.payor?.[0] ? useResource(coverage.payor[0]) : undefined;
                let payorName = 'Unknown Payor';
                if (payorResource) {
                  if ('name' in payorResource && typeof payorResource.name === 'string') {
                    payorName = payorResource.name;
                  } else if (
                    'name' in payorResource &&
                    Array.isArray(payorResource.name) &&
                    payorResource.name.length > 0
                  ) {
                    payorName = formatHumanName(payorResource.name[0]);
                  }
                }

                // Only the details string for tooltip and truncation
                const detailsText = `ID: ${coverage.subscriberId || 'N/A'}${formatClassInfo(coverage) ? ` · ${formatClassInfo(coverage)}` : ''}`;

                return (
                  <Box
                    key={coverage.id}
                    className={styles.patientSummaryListItem}
                    onMouseEnter={() => setHoverIndex(index)}
                    onMouseLeave={() => setHoverIndex(null)}
                    onClick={(e) => handleCoverageClick(coverage, e)}
                  >
                    <Tooltip label={payorName} position="top-start" openDelay={650} disabled={!isPayorOverflowed}>
                      <Box style={{ position: 'relative' }}>
                        <Text
                          size="sm"
                          className={styles.patientSummaryListItemText}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}
                        >
                          <span
                            ref={payorRef}
                            style={{
                              fontWeight: 500,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              width: '100%',
                              display: 'block',
                            }}
                          >
                            {payorName}
                          </span>
                          <span
                            ref={textRef}
                            style={{
                              fontWeight: 400,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              width: '100%',
                            }}
                          >
                            {detailsText}
                          </span>
                        </Text>
                        <Group mt={2} gap={4}>
                          <Badge size="xs" color="green" variant="light" className={styles.patientSummaryBadge}>
                            Active
                          </Badge>
                          {coverage.period?.end && (
                            <Text size="xs" fw={500} color="gray.6">
                              Ends {formatDate(coverage.period.end)}
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
                  </Box>
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

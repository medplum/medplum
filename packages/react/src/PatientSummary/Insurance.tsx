import { ActionIcon, Badge, Box, Collapse, Flex, Group, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import { Coverage } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import { IconChevronDown, IconChevronRight, IconPlus } from '@tabler/icons-react';
import { JSX, useEffect, useRef, useState } from 'react';
import { killEvent } from '../utils/dom';
import styles from './PatientSummary.module.css';

// Helper to capitalize first letter of each word
function capitalizeWords(str: string): string {
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function formatClassInfo(coverage: Coverage): string {
  const classInfo = coverage.class
    ?.filter((cls) => cls.type?.coding?.[0]?.code !== 'plan')
    .map((cls) => {
      const type = cls.type?.coding?.[0]?.code || '';
      return `${capitalizeWords(type)}: ${cls.value}`;
    })
    .join(' · ');

  return classInfo || '';
}

interface CoverageItemProps {
  coverage: Coverage;
  onClickResource?: (resource: Coverage) => void;
}

function CoverageItem({ coverage, onClickResource }: CoverageItemProps): JSX.Element {
  const [isPayorOverflowed, setIsPayorOverflowed] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const payorRef = useRef<HTMLSpanElement>(null);
  const payorResource = useResource(coverage.payor?.[0]);

  useEffect(() => {
    const payorEl = payorRef.current;
    if (payorEl) {
      setIsPayorOverflowed(payorEl.scrollWidth > payorEl.clientWidth);
    }
  }, [coverage]);

  let payorName = 'Unknown Payor';
  if (payorResource) {
    if ('name' in payorResource && typeof payorResource.name === 'string') {
      payorName = payorResource.name;
    } else if ('name' in payorResource && Array.isArray(payorResource.name) && payorResource.name.length > 0) {
      payorName = formatHumanName(payorResource.name[0]);
    }
  }

  const detailsText = `ID: ${coverage.subscriberId || 'N/A'}${formatClassInfo(coverage) ? ` · ${formatClassInfo(coverage)}` : ''}`;

  const handleClick = (e?: React.MouseEvent): void => {
    if (e) {
      killEvent(e);
    }
    if (onClickResource) {
      onClickResource(coverage);
    }
  };

  return (
    <Box className={styles.patientSummaryListItem} onClick={handleClick}>
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
            <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
              <IconChevronRight size={16} stroke={2.5} />
            </ActionIcon>
          </div>
        </Box>
      </Tooltip>
    </Box>
  );
}

export interface InsuranceProps {
  readonly coverages: Coverage[];
  readonly onClickResource?: (resource: Coverage) => void;
}

export function Insurance(props: InsuranceProps): JSX.Element {
  const { coverages, onClickResource } = props;
  const [collapsed, setCollapsed] = useState(false);

  // Filter to only show active coverages
  const activeCoverages = coverages.filter((coverage) => coverage.status === 'active');

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
              {activeCoverages.map((coverage) => (
                <CoverageItem key={coverage.id} coverage={coverage} onClickResource={onClickResource} />
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

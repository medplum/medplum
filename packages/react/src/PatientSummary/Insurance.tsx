import { ActionIcon, Badge, Box, Flex, Group, Text } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import { Coverage } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import { IconChevronRight } from '@tabler/icons-react';
import { JSX, useRef } from 'react';
import { killEvent } from '../utils/dom';
import { CollapsibleSection } from './CollapsibleSection';
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
  const textRef = useRef<HTMLSpanElement>(null);
  const payorRef = useRef<HTMLSpanElement>(null);
  const payorResource = useResource(coverage.payor?.[0]);

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
    </Box>
  );
}

export interface InsuranceProps {
  readonly coverages: Coverage[];
  readonly onClickResource?: (resource: Coverage) => void;
}

export function Insurance(props: InsuranceProps): JSX.Element {
  const { coverages, onClickResource } = props;

  // Filter to only show active coverages
  const activeCoverages = coverages.filter((coverage) => coverage.status === 'active');

  return (
    <CollapsibleSection
      title="Insurance"
      onAdd={() => {
        // TODO: Handle add new coverage
      }}
    >
      {activeCoverages.length > 0 ? (
        <Flex direction="column" gap={8}>
          {activeCoverages.map((coverage) => (
            <CoverageItem key={coverage.id} coverage={coverage} onClickResource={onClickResource} />
          ))}
        </Flex>
      ) : (
        <Text>(none)</Text>
      )}
    </CollapsibleSection>
  );
}

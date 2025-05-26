import { Box, Flex, Group, Text } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import { Coverage } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import { JSX } from 'react';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { CollapsibleSection } from './CollapsibleSection';
import styles from './PatientSummary.module.css';
import SummaryItem from './SummaryItem';

interface CoverageItemProps {
  coverage: Coverage;
  onClickResource?: (resource: Coverage) => void;
}

function CoverageItem({ coverage, onClickResource }: CoverageItemProps): JSX.Element {
  const payorResource = useResource(coverage.payor?.[0]);

  let payorName = 'Unknown Payor';
  if (payorResource) {
    if ('name' in payorResource && typeof payorResource.name === 'string') {
      payorName = payorResource.name;
    } else if ('name' in payorResource && Array.isArray(payorResource.name) && payorResource.name.length > 0) {
      payorName = formatHumanName(payorResource.name[0]);
    }
  }

  const detailsText = `ID: ${coverage.subscriberId || 'N/A'}${
    formatClassInfo(coverage) ? ` · ${formatClassInfo(coverage)}` : ''
  }`;

  return (
    <SummaryItem
      onClick={() => {
        onClickResource?.(coverage);
      }}
    >
      <Box>
        <Text fw={500} className={styles.itemText}>
          {payorName}
        </Text>
        <Text fw={500} className={styles.itemText}>
          {detailsText}
        </Text>
        <Group mt={2} gap={4}>
          <StatusBadge color="green" variant="light" status="Active" />
          <Text size="xs" fw={500} color="gray.6">
            Ends {formatDate(coverage.period?.end)}
          </Text>
        </Group>
      </Box>
    </SummaryItem>
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
    <CollapsibleSection title="Insurance">
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

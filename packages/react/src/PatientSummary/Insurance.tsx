// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex, Group, Text } from '@mantine/core';
import { formatDate } from '@medplum/core';
import { Coverage, Organization, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import { JSX } from 'react';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { CollapsibleSection } from './CollapsibleSection';
import styles from './PatientSummary.module.css';
import SummaryItem from './SummaryItem';

export interface CoverageItemProps {
  readonly coverage: Coverage | Reference<Coverage>;
  readonly organization?: Organization | Reference<Organization>;
  readonly onClickResource?: (resource: Coverage) => void;
}

export function CoverageItem(props: CoverageItemProps): JSX.Element {
  const { coverage, organization, onClickResource } = props;
  const coverageResource = useResource(coverage);
  const organizationResource = useResource(organization);
  let payorName = 'Unknown Payor';
  if (organizationResource) {
    if ('name' in organizationResource && typeof organizationResource.name === 'string') {
      payorName = organizationResource.name;
    }
  }

  const detailsText = `ID: ${coverageResource?.subscriberId ?? 'N/A'}${
    formatClassInfo(coverageResource) ? ` · ${formatClassInfo(coverageResource)}` : ''
  }`;

  return (
    <SummaryItem
      onClick={() => {
        if (coverageResource) {
          onClickResource?.(coverageResource);
        }
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
            Ends {formatDate(coverageResource?.period?.end)}
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
            <CoverageItem
              key={coverage.id}
              coverage={coverage}
              organization={coverage.payor?.[0] as Reference<Organization>}
              onClickResource={onClickResource}
            />
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

function formatClassInfo(coverage: Coverage | undefined): string {
  if (!coverage) {
    return '';
  }
  const classInfo = coverage.class
    ?.filter((cls) => cls.type?.coding?.[0]?.code !== 'plan')
    .map((cls) => {
      const type = cls.type?.coding?.[0]?.code ?? '';
      return `${capitalizeWords(type)}: ${cls.value}`;
    })
    .join(' · ');
  return classInfo ?? '';
}

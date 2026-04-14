// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Flex, Stack, Text, Title } from '@mantine/core';
import { formatPeriod } from '@medplum/core';
import type { Coverage, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import type { JSX } from 'react';

export interface CoverageSummaryProps {
  coverage: Coverage | Reference<Coverage>;
  checking: boolean;
  onCheckEligibility: () => void;
}

export function CoverageSummary(props: CoverageSummaryProps): JSX.Element {
  const { coverage: coverageRef, checking, onCheckEligibility } = props;
  const coverage= useResource(coverageRef);

  if (!coverage) {
    return <Text>Loading...</Text>;
  }

  const payorName = coverage.payor?.[0]?.display ?? coverage.payor?.[0]?.reference ?? 'Unknown Payor';
  const planName =
    coverage.class?.find((c) => c.type?.coding?.[0]?.code === 'plan')?.name ??
    coverage.type?.text ??
    coverage.type?.coding?.[0]?.display;
  const subscriberId = coverage.subscriberId ?? coverage.identifier?.[0]?.value;
  const periodText = coverage.period ? formatPeriod(coverage.period) : undefined;

  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="flex-start" gap="xs">
        <Title order={6} style={{ lineHeight: 1.3 }}>
          {payorName}
        </Title>
        <Button size="xs" variant="filled" loading={checking} onClick={onCheckEligibility} style={{ flexShrink: 0 }}>
          Check Eligibility
        </Button>
      </Flex>
      {planName && (
        <Text size="sm" c="dimmed">
          {planName}
        </Text>
      )}
      {subscriberId && (
        <Text size="sm">
          <Text span fw={500}>
            ID:{' '}
          </Text>
          {subscriberId}
        </Text>
      )}
      {periodText && (
        <Text size="xs" c="dimmed">
          {periodText}
        </Text>
      )}
      <Badge size="sm" color={getCoverageStatusColor(coverage.status)} variant="light" w="fit-content">
        {coverage.status ?? 'unknown'}
      </Badge>
    </Stack>
  );
}

function getCoverageStatusColor(status: string | undefined): string {
  switch (status) {
    case 'active':
      return 'green';
    case 'cancelled':
      return 'red';
    case 'entered-in-error':
      return 'orange';
    case 'draft':
    default:
      return 'gray';
  }
}

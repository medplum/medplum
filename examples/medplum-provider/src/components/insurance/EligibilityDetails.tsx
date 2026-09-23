// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Box,
  Divider,
  Flex,
  Group,
  Paper,
  ScrollArea,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { formatDateTime, formatPeriod } from '@medplum/core';
import type {
  CoverageEligibilityRequest,
  CoverageEligibilityResponse,
  CoverageEligibilityResponseInsurance,
} from '@medplum/fhirtypes';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { BenefitsTable } from './BenefitsTable';
import { formatPurpose } from './utils';

interface EligibilityDetailsProps {
  request: CoverageEligibilityRequest;
  response: CoverageEligibilityResponse | undefined;
  loadingResponse: boolean;
}

export function EligibilityDetails({ request, response, loadingResponse }: EligibilityDetailsProps): JSX.Element {
  const purpose = request.purpose?.map(formatPurpose).join(', ') ?? 'Eligibility Check';
  const insurer = request.insurer?.display ?? request.insurer?.reference;

  return (
    <Flex direction="column" h="100%">
      <Box p="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={4} miw={0}>
            <Text fw={700} size="lg">
              {purpose}
            </Text>
            <Group gap={6} c="dimmed" fz="sm" wrap="nowrap">
              <Text size="sm" c="dimmed">
                {formatDateTime(request.created)}
              </Text>
              {insurer && (
                <>
                  <Text size="sm" c="dimmed">
                    ·
                  </Text>
                  <Text size="sm" c="dimmed" truncate>
                    {insurer}
                  </Text>
                </>
              )}
            </Group>
          </Stack>
          <OutcomeBadge response={response} loading={loadingResponse} />
        </Group>
      </Box>
      <Divider />
      <ScrollArea flex={1}>
        <Stack gap="md" p="md">
          <RequestSection request={request} />
          <ResponseSection response={response} loading={loadingResponse} />
        </Stack>
      </ScrollArea>
    </Flex>
  );
}

function OutcomeBadge({
  response,
  loading,
}: {
  response: CoverageEligibilityResponse | undefined;
  loading: boolean;
}): JSX.Element {
  if (loading) {
    return <Skeleton height={22} width={90} radius="xl" />;
  }
  if (!response) {
    return (
      <Badge color="gray" variant="light" size="lg">
        Pending
      </Badge>
    );
  }
  return (
    <Badge color={getOutcomeColor(response.outcome)} variant="light" size="lg">
      {formatOutcome(response.outcome)}
    </Badge>
  );
}

function getServicedDateText(request: CoverageEligibilityRequest): string {
  if (request.servicedDate) {
    return formatDateTime(request.servicedDate);
  }
  if (request.servicedPeriod) {
    return formatPeriod(request.servicedPeriod);
  }
  return '—';
}

function RequestSection({ request }: { request: CoverageEligibilityRequest }): JSX.Element {
  return (
    <Section title="Eligibility Request">
      <SimpleGrid cols={2} spacing="md">
        <DetailField label="Created" value={formatDateTime(request.created)} />
        <DetailField label="Serviced Date" value={getServicedDateText(request)} />
      </SimpleGrid>
    </Section>
  );
}

function ResponseSection({
  response,
  loading,
}: {
  response: CoverageEligibilityResponse | undefined;
  loading: boolean;
}): JSX.Element {
  if (loading) {
    return (
      <Section title="Eligibility Response">
        <Stack gap="xs">
          <Skeleton height={14} width="60%" />
          <Skeleton height={14} width="80%" />
          <Skeleton height={14} width="50%" />
        </Stack>
      </Section>
    );
  }

  if (!response) {
    return (
      <Section title="Eligibility Response">
        <Text size="sm" c="dimmed">
          No response received yet.
        </Text>
      </Section>
    );
  }

  const isError = response.outcome === 'error';

  return (
    <Section title="Eligibility Response">
      {isError && response.disposition && (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />}>
          {response.disposition}
        </Alert>
      )}
      <SimpleGrid cols={2} spacing="md">
        <DetailField label="Insurer" value={response.insurer?.display ?? response.insurer?.reference ?? '—'} />
        <DetailField label="Created" value={formatDateTime(response.created)} />
        {!isError && response.disposition && <DetailField label="Disposition" value={response.disposition} />}
      </SimpleGrid>
      {response.insurance?.map((insurance, index) => (
        <InsuranceSection key={index} insurance={insurance} index={index} total={response.insurance?.length ?? 1} />
      ))}
    </Section>
  );
}

function InsuranceSection({
  insurance,
  index,
  total,
}: {
  insurance: CoverageEligibilityResponseInsurance;
  index: number;
  total: number;
}): JSX.Element {
  const hasFields = insurance.inforce !== undefined || insurance.benefitPeriod;
  return (
    <Stack gap="md">
      <Divider />
      {total > 1 && (
        <Text fw={600} size="sm">
          Coverage {index + 1}
        </Text>
      )}
      {hasFields && (
        <SimpleGrid cols={2} spacing="md">
          {insurance.inforce !== undefined && (
            <DetailField
              label="Coverage In Force"
              value={
                <Text size="sm" fw={600} c={insurance.inforce ? 'green' : 'red'}>
                  {insurance.inforce ? 'Yes' : 'No'}
                </Text>
              }
            />
          )}
          {insurance.benefitPeriod && (
            <DetailField label="Benefit Period" value={formatPeriod(insurance.benefitPeriod)} />
          )}
        </SimpleGrid>
      )}
      {insurance.item && insurance.item.length > 0 && (
        <Stack gap="xs">
          <Title order={6}>Plan Benefits</Title>
          <BenefitsTable items={insurance.item} />
        </Stack>
      )}
    </Stack>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Title order={5}>{title}</Title>
        {children}
      </Stack>
    </Paper>
  );
}

function DetailField({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <Box>
      <Text size="xs" c="dimmed" fw={500}>
        {label}
      </Text>
      {typeof value === 'string' ? (
        <Text size="sm" fw={500}>
          {value}
        </Text>
      ) : (
        value
      )}
    </Box>
  );
}

function getOutcomeColor(outcome: string | undefined): string {
  switch (outcome) {
    case 'complete':
      return 'green';
    case 'partial':
      return 'yellow';
    case 'error':
      return 'red';
    case 'queued':
      return 'blue';
    default:
      return 'gray';
  }
}

function formatOutcome(outcome: string | undefined): string {
  switch (outcome) {
    case 'complete':
      return 'Complete';
    case 'error':
      return 'Error';
    case 'partial':
      return 'Partial';
    case 'queued':
      return 'Queued';
    default:
      return outcome ?? 'Unknown';
  }
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Divider, Group, ScrollArea, Skeleton, Stack, Table, Text, Title } from '@mantine/core';
import { formatDate, formatMoney, formatPeriod } from '@medplum/core';
import type {
  CoverageEligibilityRequest,
  CoverageEligibilityResponse,
  CoverageEligibilityResponseInsuranceItemBenefit,
} from '@medplum/fhirtypes';
import { ResourceAvatar } from '@medplum/react';
import type { JSX, ReactNode } from 'react';

interface EligibilityDetailsProps {
  request: CoverageEligibilityRequest;
  response: CoverageEligibilityResponse | undefined;
  loadingResponse: boolean;
}

export function EligibilityDetails({ request, response, loadingResponse }: EligibilityDetailsProps): JSX.Element {
  return (
    <ScrollArea h="100%">
      <Stack gap="xl" p="xl">
        <RequestSection request={request} />
        <Divider />
        <ResponseSection response={response} loading={loadingResponse} />
      </Stack>
    </ScrollArea>
  );
}

function getServicedDateText(request: CoverageEligibilityRequest): string {
  if (request.servicedDate) {
    return formatDate(request.servicedDate);
  }
  if (request.servicedPeriod) {
    return formatPeriod(request.servicedPeriod);
  }
  return '—';
}

function RequestSection({ request }: { request: CoverageEligibilityRequest }): JSX.Element {
  const providerDisplay = request.provider?.display ?? request.provider?.reference ?? '—';

  return (
    <Stack gap="md">
      <Title order={5}>Eligibility Request</Title>
      <Table>
        <Table.Tbody>
          <DetailRow label="Created" value={formatDate(request.created)} />
          <DetailRow label="Purpose" value={request.purpose?.map(formatPurpose).join(', ') ?? '—'} />
          <DetailRow label="Serviced Date" value={getServicedDateText(request)} />
          {request.provider && (
            <DetailRow
              label="Provider"
              value={
                <Group gap="xs">
                  <ResourceAvatar value={request.provider} size="xs" />
                  <Text size="sm">{providerDisplay}</Text>
                </Group>
              }
            />
          )}
          <DetailRow label="Insurer" value={request.insurer?.display ?? request.insurer?.reference ?? '—'} />
        </Table.Tbody>
      </Table>
    </Stack>
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
      <Stack gap="md">
        <Title order={5}>Eligibility Response</Title>
        <Stack gap="xs">
          <Skeleton height={14} width="60%" />
          <Skeleton height={14} width="80%" />
          <Skeleton height={14} width="50%" />
        </Stack>
      </Stack>
    );
  }

  if (!response) {
    return (
      <Stack gap="md">
        <Title order={5}>Eligibility Response</Title>
        <Text size="sm" c="dimmed">
          No response received yet.
        </Text>
      </Stack>
    );
  }

  const firstInsurance = response.insurance?.[0];

  return (
    <Stack gap="md">
      <Title order={5}>Eligibility Response</Title>
      <Table>
        <Table.Tbody>
          <DetailRow label="Outcome" value={formatOutcome(response.outcome)} />
          {response.disposition && <DetailRow label="Disposition" value={response.disposition} />}
          <DetailRow label="Insurer" value={response.insurer?.display ?? response.insurer?.reference ?? '—'} />
          <DetailRow label="Created" value={formatDate(response.created)} />
          {firstInsurance?.inforce !== undefined && (
            <DetailRow label="Coverage In Force" value={firstInsurance.inforce ? 'Yes' : 'No'} />
          )}
          {firstInsurance?.benefitPeriod && (
            <DetailRow label="Benefit Period" value={formatPeriod(firstInsurance.benefitPeriod)} />
          )}
        </Table.Tbody>
      </Table>
      {firstInsurance?.item && firstInsurance.item.length > 0 && <BenefitsTable items={firstInsurance.item} />}
    </Stack>
  );
}

type BenefitTableItem = NonNullable<NonNullable<CoverageEligibilityResponse['insurance']>[number]['item']>;

function BenefitsTable({ items }: { items: BenefitTableItem }): JSX.Element {
  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">
        Benefits
      </Text>
      <Box style={{ overflowX: 'auto' }}>
        <Table striped withTableBorder withColumnBorders fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Category</Table.Th>
              <Table.Th>Network</Table.Th>
              <Table.Th>Unit</Table.Th>
              <Table.Th>Term</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Allowed</Table.Th>
              <Table.Th>Used</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.flatMap((item, itemIndex) => {
              const category = item.category?.text ?? item.category?.coding?.[0]?.display ?? '—';
              const network = item.network?.text ?? item.network?.coding?.[0]?.display ?? '—';
              const unit = item.unit?.text ?? item.unit?.coding?.[0]?.display ?? '—';
              const term = item.term?.text ?? item.term?.coding?.[0]?.display ?? '—';

              if (!item.benefit || item.benefit.length === 0) {
                return [
                  <Table.Tr key={itemIndex}>
                    <Table.Td>{category}</Table.Td>
                    <Table.Td>{network}</Table.Td>
                    <Table.Td>{unit}</Table.Td>
                    <Table.Td>{term}</Table.Td>
                    <Table.Td>—</Table.Td>
                    <Table.Td>—</Table.Td>
                    <Table.Td>—</Table.Td>
                  </Table.Tr>,
                ];
              }

              return item.benefit.map((benefit, benefitIndex) => (
                <Table.Tr key={`${itemIndex}-${benefitIndex}`}>
                  <Table.Td>{category}</Table.Td>
                  <Table.Td>{network}</Table.Td>
                  <Table.Td>{unit}</Table.Td>
                  <Table.Td>{term}</Table.Td>
                  <Table.Td>{benefit.type?.text ?? benefit.type?.coding?.[0]?.display ?? '—'}</Table.Td>
                  <Table.Td>{formatBenefitValue(benefit, 'allowed')}</Table.Td>
                  <Table.Td>{formatBenefitValue(benefit, 'used')}</Table.Td>
                </Table.Tr>
              ));
            })}
          </Table.Tbody>
        </Table>
      </Box>
    </Stack>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <Table.Tr>
      <Table.Td w={160}>
        <Text size="sm" c="dimmed" fw={500}>
          {label}
        </Text>
      </Table.Td>
      <Table.Td>
        {typeof value === 'string' && <Text size="sm">{value}</Text>}
        {typeof value !== 'string' && value}
      </Table.Td>
    </Table.Tr>
  );
}

function formatBenefitValue(
  benefit: CoverageEligibilityResponseInsuranceItemBenefit,
  prefix: 'allowed' | 'used'
): string {
  if (prefix === 'allowed') {
    if (benefit.allowedUnsignedInt !== undefined) {
      return benefit.allowedUnsignedInt.toLocaleString();
    }
    if (benefit.allowedString) {
      return benefit.allowedString;
    }
    if (benefit.allowedMoney) {
      return formatMoney(benefit.allowedMoney);
    }
  } else {
    if (benefit.usedUnsignedInt !== undefined) {
      return benefit.usedUnsignedInt.toLocaleString();
    }
    if (benefit.usedString) {
      return benefit.usedString;
    }
    if (benefit.usedMoney) {
      return formatMoney(benefit.usedMoney);
    }
  }
  return '—';
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

function formatPurpose(purpose: string): string {
  switch (purpose) {
    case 'auth-requirements':
      return 'Auth Requirements';
    case 'benefits':
      return 'Benefits';
    case 'discovery':
      return 'Discovery';
    case 'validation':
      return 'Validation';
    default:
      return purpose;
  }
}

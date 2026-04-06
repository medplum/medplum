// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, ScrollArea, Skeleton, Stack, Table, Text, Title } from '@mantine/core';
import { formatDate, formatPeriod } from '@medplum/core';
import type {
  CoverageEligibilityRequest,
  CoverageEligibilityResponse,
  CoverageEligibilityResponseInsurance,
} from '@medplum/fhirtypes';
import type { JSX, ReactNode } from 'react';
import { BenefitsTable } from './BenefitsTable';
import { formatPurpose } from './utils';

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
  return (
    <Stack gap="md">
      <Title order={5}>Eligibility Request</Title>
      <Table>
        <Table.Tbody>
          <DetailRow label="Created" value={formatDate(request.created)} />
          <DetailRow label="Purpose" value={request.purpose?.map(formatPurpose).join(', ') ?? '—'} />
          <DetailRow label="Serviced Date" value={getServicedDateText(request)} />
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

  return (
    <Stack gap="md">
      <Title order={5}>Eligibility Response</Title>
      <Table>
        <Table.Tbody>
          <DetailRow label="Outcome" value={formatOutcome(response.outcome)} />
          {response.disposition && <DetailRow label="Disposition" value={response.disposition} />}
          <DetailRow label="Insurer" value={response.insurer?.display ?? response.insurer?.reference ?? '—'} />
          <DetailRow label="Created" value={formatDate(response.created)} />
        </Table.Tbody>
      </Table>
      {response.insurance?.map((insurance, index) => (
        <InsuranceSection key={index} insurance={insurance} index={index} total={response.insurance?.length ?? 1} />
      ))}
    </Stack>
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
  return (
    <Stack gap="md">
      {total > 1 && (
        <Text fw={600} size="sm">
          Coverage {index + 1}
        </Text>
      )}
      <Table>
        <Table.Tbody>
          {insurance.inforce !== undefined && (
            <DetailRow label="Coverage In Force" value={insurance.inforce ? 'Yes' : 'No'} />
          )}
          {insurance.benefitPeriod && (
            <DetailRow label="Benefit Period" value={formatPeriod(insurance.benefitPeriod)} />
          )}
        </Table.Tbody>
      </Table>
      {insurance.item && insurance.item.length > 0 && <BenefitsTable items={insurance.item} />}
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

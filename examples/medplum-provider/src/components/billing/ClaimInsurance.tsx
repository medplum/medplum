// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Badge, Group, Loader, Stack, Table, Text } from '@mantine/core';
import { formatDate, formatDateTime, formatMoney, formatPeriod, normalizeErrorString } from '@medplum/core';
import type { Claim, Coverage, CoverageEligibilityResponse, Money, OperationOutcome } from '@medplum/fhirtypes';
import { ResourceName, useResource, useSearchResources } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { Link } from 'react-router';
import { BenefitsTable } from '../insurance/BenefitsTable';
import classes from './ClaimDetailPane.module.css';
import { getLineCharge } from './claimEditing';
import { DetailSection, MetaItem } from './DetailSection';
import { FEE_SCHEDULE_TAG_VALUE, findPayerFeeSchedule, getFeeScheduleRate } from './feeSchedules';

const STATUS_COLORS: Record<string, string> = { active: 'green', cancelled: 'red', draft: 'blue' };
const OUTCOME_COLORS: Record<string, string> = { complete: 'green', error: 'red', partial: 'yellow', queued: 'gray' };
const ORDER_LABELS = ['Primary', 'Secondary', 'Tertiary'];

/**
 * The claim's insurance: the Coverage it bills, the patient's latest eligibility response for that coverage, and the
 * payer's fee schedule rates for the claim's service lines.
 * @param props - The ClaimInsurance React props.
 * @param props.claim - The claim.
 * @returns The insurance tab.
 */
export function ClaimInsurance(props: { readonly claim: Claim }): JSX.Element {
  const { claim } = props;
  const insurance = claim.insurance?.find((i) => i.focal) ?? claim.insurance?.[0];
  const coverageRef = insurance?.coverage?.reference;
  const [coverageError, setCoverageError] = useState<OperationOutcome>();
  const coverage = useResource<Coverage>(coverageRef ? { reference: coverageRef } : undefined, setCoverageError);
  const [responses] = useSearchResources('CoverageEligibilityResponse', {
    patient: claim.patient.reference ?? '',
    _sort: '-created',
    _count: '20',
  });
  const [schedules, schedulesLoading] = useSearchResources('ChargeItemDefinition', {
    _tag: FEE_SCHEDULE_TAG_VALUE,
    _count: '100',
  });

  if (!insurance) {
    return (
      <Text size="sm" c="dimmed">
        This claim has no insurance. Add a coverage before you submit it.
      </Text>
    );
  }

  const eligibility =
    responses?.find((r) => r.insurance?.some((i) => i.coverage?.reference === coverageRef)) ?? responses?.[0];
  const payer = coverage?.payor?.[0] ?? claim.insurer;

  return (
    <Stack gap="md">
      {coverage ? (
        <CoverageSection coverage={coverage} sequence={insurance.sequence} />
      ) : (
        <DetailSection title="Coverage">
          {coverageRef && !coverageError ? (
            <Loader size="sm" />
          ) : (
            <Text size="sm" c="dimmed">
              {coverageError
                ? `Couldn't load ${coverageRef}: ${normalizeErrorString(coverageError)}`
                : `This claim names ${insurance.coverage.display ?? 'a coverage'} but doesn't link to it.`}
            </Text>
          )}
        </DetailSection>
      )}
      <EligibilitySection response={eligibility} coverageRef={coverageRef} />
      {schedulesLoading ? (
        <Loader size="sm" />
      ) : (
        <FeeScheduleSection
          claim={claim}
          schedule={findPayerFeeSchedule(schedules ?? [], payer)}
          payer={payer?.display}
        />
      )}
    </Stack>
  );
}

function CoverageSection(props: { readonly coverage: Coverage; readonly sequence: number }): JSX.Element {
  const { coverage, sequence } = props;
  const plan = coverage.class?.find((c) => c.type.coding?.some((t) => t.code === 'plan'));
  const group = coverage.class?.find((c) => c.type.coding?.some((t) => t.code === 'group'));
  const relationship = coverage.relationship?.coding?.[0];
  return (
    <DetailSection
      title="Coverage"
      description={ORDER_LABELS[(coverage.order ?? sequence) - 1] ?? `Coverage ${coverage.order ?? sequence}`}
      action={
        <Badge variant="light" color={STATUS_COLORS[coverage.status] ?? 'gray'}>
          {coverage.status}
        </Badge>
      }
    >
      <div className={classes.metaGrid}>
        <MetaItem label="Payer" value={coverage.payor?.[0] ? <ResourceName value={coverage.payor[0]} /> : '—'} />
        <MetaItem label="Member ID" value={coverage.subscriberId ?? coverage.identifier?.[0]?.value ?? '—'} />
        <MetaItem label="Plan" value={plan ? (plan.name ?? plan.value) : '—'} />
        <MetaItem label="Group" value={group ? (group.name ?? group.value) : '—'} />
        <MetaItem label="Subscriber" value={coverage.subscriber ? <ResourceName value={coverage.subscriber} /> : '—'} />
        <MetaItem label="Relationship" value={relationship?.display ?? relationship?.code ?? '—'} />
        <MetaItem label="Coverage Period" value={coverage.period ? formatPeriod(coverage.period) : '—'} />
      </div>
    </DetailSection>
  );
}

function EligibilitySection(props: {
  readonly response: CoverageEligibilityResponse | undefined;
  readonly coverageRef: string | undefined;
}): JSX.Element {
  const { response, coverageRef } = props;
  if (!response) {
    return (
      <DetailSection title="Eligibility">
        <Text size="sm" c="dimmed">
          No eligibility check for this patient yet.
        </Text>
      </DetailSection>
    );
  }
  const insurance = response.insurance?.find((i) => i.coverage?.reference === coverageRef) ?? response.insurance?.[0];
  return (
    <DetailSection
      title="Eligibility"
      description={`Checked ${formatDateTime(response.created)}`}
      action={
        <Badge variant="light" color={OUTCOME_COLORS[response.outcome] ?? 'gray'}>
          {response.outcome}
        </Badge>
      }
    >
      <div className={classes.metaGrid}>
        <MetaItem label="Insurer" value={response.insurer?.display ?? '—'} />
        <MetaItem label="In Force" value={formatInForce(insurance?.inforce)} />
        <MetaItem
          label="Benefit Period"
          value={insurance?.benefitPeriod ? formatPeriod(insurance.benefitPeriod) : '—'}
        />
      </div>
      {response.disposition && (
        <Text size="sm" c={response.outcome === 'error' ? 'red' : undefined}>
          {response.disposition}
        </Text>
      )}
      {insurance?.item && insurance.item.length > 0 && <BenefitsTable items={insurance.item} />}
    </DetailSection>
  );
}

function FeeScheduleSection(props: {
  readonly claim: Claim;
  readonly schedule: ReturnType<typeof findPayerFeeSchedule>;
  readonly payer: string | undefined;
}): JSX.Element {
  const { claim, schedule, payer } = props;
  if (!schedule) {
    return (
      <DetailSection title="Fee Schedule">
        <Text size="sm" c="dimmed">
          No fee schedule for {payer ?? 'this payer'}.{' '}
          <Anchor component={Link} to="/settings/billing/fee-schedules" size="sm">
            Manage fee schedules
          </Anchor>
        </Text>
      </DetailSection>
    );
  }
  const period = schedule.effectivePeriod;
  return (
    <DetailSection
      title="Fee Schedule"
      description={
        <Group gap={4} component="span">
          <Anchor component={Link} to={`/ChargeItemDefinition/${schedule.id}`} size="sm">
            {schedule.title ?? schedule.name ?? 'Fee schedule'}
          </Anchor>
          {period && <span>• {[formatDate(period.start), formatDate(period.end)].filter(Boolean).join(' – ')}</span>}
        </Group>
      }
    >
      <Table horizontalSpacing="sm" verticalSpacing="xs" className={classes.table}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Code</Table.Th>
            <Table.Th>Billed</Table.Th>
            <Table.Th>Contract Rate</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(claim.item ?? []).map((item) => {
            const code = item.productOrService?.coding?.[0]?.code;
            return (
              <Table.Tr key={item.sequence}>
                <Table.Td>{code ?? '—'}</Table.Td>
                <Table.Td>{formatMoney({ value: getLineCharge(item), currency: 'USD' })}</Table.Td>
                <Table.Td>{formatAmount(getFeeScheduleRate(schedule, code))}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </DetailSection>
  );
}

function formatAmount(money: Money | undefined): string {
  return money?.value === undefined ? '—' : formatMoney(money);
}

function formatInForce(inforce: boolean | undefined): string {
  if (inforce === undefined) {
    return '—';
  }
  return inforce ? 'Yes' : 'No';
}

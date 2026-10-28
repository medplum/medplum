// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import type { SearchRequest, WithId } from '@medplum/core';
import { DEFAULT_SEARCH_COUNT, formatDate, formatMoney, formatSearchQuery, parseSearchRequest } from '@medplum/core';
import type { PaymentReconciliation, PaymentReconciliationDetail } from '@medplum/fhirtypes';
import { Loading, SearchControl, useMedplum } from '@medplum/react';
import { IconAlertTriangle, IconInfoCircle, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { BillingNavDivider, BillingNavGroup, BillingNavLink } from './BillingNavLink';
import { sameFilter } from './claimQueues';
import type { RemitView } from './remitViews';
import { getRemitStatus, getRemitView, isUnmatched, REMIT_FIELDS, REMIT_VIEWS } from './remitViews';
import { WorklistDrawer } from './WorklistDrawer';

export interface RemitNavProps {
  readonly baseUrl: string;
  readonly viewId: string;
  readonly onNavigate: (path: string) => void;
}

/**
 * The remittance views as sidebar links, each with its count.
 * @param props - The RemitNav React props.
 * @returns The RemitNav React node.
 */
export function RemitNav(props: RemitNavProps): JSX.Element {
  const { baseUrl, viewId, onNavigate } = props;
  const medplum = useMedplum();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    for (const view of REMIT_VIEWS) {
      const query = formatSearchQuery({
        resourceType: 'PaymentReconciliation',
        filters: view.filters,
        count: 0,
        total: 'accurate',
      });
      medplum
        .search('PaymentReconciliation', query.slice(1), { cache: 'no-cache' })
        .then(
          (bundle) =>
            active &&
            bundle.total !== undefined &&
            setCounts((prev) => ({ ...prev, [view.id]: bundle.total as number }))
        )
        .catch(console.error);
    }
    return () => {
      active = false;
    };
  }, [medplum]);

  return (
    <Stack gap={2} component="nav" aria-label="Remittance views">
      {REMIT_VIEWS.map((view, i) => {
        const showGroup = view.group && REMIT_VIEWS[i - 1]?.group !== view.group;
        return (
          <Fragment key={view.id}>
            {showGroup && <BillingNavDivider />}
            {showGroup && <BillingNavGroup>{view.group}</BillingNavGroup>}
            <BillingNavLink
              href={`${baseUrl}/${view.id}`}
              label={view.label}
              dotColor={view.color}
              count={counts[view.id]}
              active={view.id === viewId}
              onNavigate={() => onNavigate(view.id)}
            />
          </Fragment>
        );
      })}
      <BillingNavDivider />
    </Stack>
  );
}

export interface RemitsWorklistProps {
  readonly viewId: string;
  /** Set to show one remittance's detail in a drawer over the list. */
  readonly remitId?: string;
  readonly query: string;
  /** The width of the area the worklist fills, which sizes the remittance drawer. */
  readonly areaWidth: number;
  /** Navigates to a path below the remits root. */
  readonly onNavigate: (path: string) => void;
  /** Opens a claim in the claims worklist. */
  readonly onOpenClaim: (claimId: string) => void;
}

/**
 * The remittances in one view. Partially posted and Posting error list each remittance with what needs fixing
 * under it; the other views are a plain table.
 * @param props - The RemitsWorklist React props.
 * @returns The RemitsWorklist React node.
 */
export function RemitsWorklist(props: RemitsWorklistProps): JSX.Element {
  const { viewId, remitId, query, areaWidth, onNavigate, onOpenClaim } = props;
  const view = getRemitView(viewId);

  const search = useMemo((): SearchRequest => {
    const parsed = parseSearchRequest(`PaymentReconciliation${query}`);
    return {
      ...parsed,
      filters: [...view.filters, ...(parsed.filters ?? [])],
      fields: parsed.fields ?? REMIT_FIELDS,
      sortRules: parsed.sortRules ?? [{ code: 'created', descending: true }],
      count: parsed.count ?? DEFAULT_SEARCH_COUNT,
    };
  }, [query, view]);

  const openRemit = (id: string | undefined): void => onNavigate(`${view.id}/${id}${query}`);
  const closeRemit = useCallback(() => onNavigate(`${view.id}${query}`), [onNavigate, view.id, query]);

  return (
    <>
      {view.id === 'partial' || view.id === 'error' ? (
        <RemitExceptions view={view} onOpenRemit={openRemit} />
      ) : (
        <RemitTable view={view} search={search} remitId={remitId} onNavigate={onNavigate} onOpenRemit={openRemit} />
      )}
      <WorklistDrawer opened={!!remitId} label="Remittance" areaWidth={areaWidth} onClose={closeRemit}>
        {remitId && <RemitDetail key={remitId} remitId={remitId} onClose={closeRemit} onOpenClaim={onOpenClaim} />}
      </WorklistDrawer>
    </>
  );
}

function RemitTable(props: {
  readonly view: RemitView;
  readonly search: SearchRequest;
  readonly remitId?: string;
  readonly onNavigate: (path: string) => void;
  readonly onOpenRemit: (id: string | undefined) => void;
}): JSX.Element {
  const { view, search, remitId, onNavigate, onOpenRemit } = props;
  return (
    <SearchControl
      search={search}
      activeResourceId={remitId}
      onChange={(e) => {
        const own = (e.definition.filters ?? []).filter((f) => !view.filters.some((v) => sameFilter(v, f)));
        onNavigate(`${view.id}${formatSearchQuery({ ...e.definition, filters: own })}`);
      }}
      onClick={(e) => onOpenRemit(e.resource.id)}
      additionalColumns={[
        {
          name: 'Status',
          renderCell: (resource) => {
            const status = getRemitStatus(resource as PaymentReconciliation);
            return (
              <Badge color={status.color} variant="light">
                {status.label}
              </Badge>
            );
          },
        },
      ]}
    />
  );
}

/**
 * The remittances that need someone, each with a callout per problem and the fix beside it.
 * @param props - The view and a way to open a remittance.
 * @param props.view - The Partially posted or Posting error view.
 * @param props.onOpenRemit - Opens a remittance's detail.
 * @returns The list.
 */
function RemitExceptions(props: { readonly view: RemitView; readonly onOpenRemit: (id: string) => void }): JSX.Element {
  const { view, onOpenRemit } = props;
  const medplum = useMedplum();
  const [remits, setRemits] = useState<WithId<PaymentReconciliation>[]>();

  useEffect(() => {
    let active = true;
    const query = formatSearchQuery({ resourceType: 'PaymentReconciliation', filters: view.filters, count: 100 });
    medplum
      .searchResources('PaymentReconciliation', query.slice(1), { cache: 'no-cache' })
      .then((found) => active && setRemits(found))
      .catch(showErrorNotification);
    return () => {
      active = false;
    };
  }, [medplum, view]);

  if (!remits) {
    return <Loading />;
  }
  if (!remits.length) {
    return (
      <Text c="dimmed" ta="center" py={80}>
        Nothing to resolve. Every remittance in this view has been handled.
      </Text>
    );
  }
  return (
    <Stack gap="sm">
      {remits.map((remit) => (
        <Paper key={remit.id} withBorder radius="md" p="sm">
          <Stack gap="xs">
            <RemitSummaryRow remit={remit} onOpen={() => onOpenRemit(remit.id)} />
            {view.id === 'error' ? (
              <IssueCallout
                color="red"
                text={remit.disposition ?? 'This 835 could not be posted. Nothing from it reached a claim.'}
                actions={['Dismiss', 'Retry posting']}
              />
            ) : (
              (remit.detail ?? [])
                .filter(isUnmatched)
                .map((detail, i) => (
                  <IssueCallout
                    key={`${detail.identifier?.value ?? i}`}
                    color="orange"
                    text={describeUnmatched(detail)}
                    actions={
                      detail.type?.coding?.[0]?.code === 'adjustment'
                        ? ['Post as adjustment']
                        : ['Match to claim', 'Post manually']
                    }
                  />
                ))
            )}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

function RemitSummaryRow(props: { readonly remit: PaymentReconciliation; readonly onOpen: () => void }): JSX.Element {
  const { remit, onOpen } = props;
  const status = getRemitStatus(remit);
  return (
    <Group justify="space-between" wrap="nowrap">
      <Anchor component="button" type="button" onClick={onOpen} c="inherit" underline="never" data-worklist-row>
        <Group gap="md" wrap="nowrap">
          <Text size="sm">{formatDate(remit.paymentDate)}</Text>
          <Text size="sm" fw={600}>
            {remit.paymentIssuer?.display ?? 'Unknown payer'}
          </Text>
          <Text size="sm" ff="monospace" c="dimmed">
            {remit.paymentIdentifier?.value}
          </Text>
          <Text size="sm">{formatMoney(remit.paymentAmount)}</Text>
        </Group>
      </Anchor>
      <Badge color={status.color} variant="light">
        {status.label}
      </Badge>
    </Group>
  );
}

function IssueCallout(props: {
  readonly color: string;
  readonly text: string;
  readonly actions: string[];
}): JSX.Element {
  return (
    <Alert color={props.color} variant="light" p="xs" icon={<IconAlertTriangle size={16} />}>
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm">{props.text}</Text>
        <Group gap={6} wrap="nowrap">
          {props.actions.map((label) => (
            <Tooltip key={label} label="Coming soon">
              <Button size="compact-sm" variant="default" disabled>
                {label}
              </Button>
            </Tooltip>
          ))}
        </Group>
      </Group>
    </Alert>
  );
}

function describeUnmatched(detail: PaymentReconciliationDetail): string {
  const amount = detail.amount ? formatMoney(detail.amount) : 'A payment';
  const what = detail.type?.coding?.[0]?.display ?? detail.type?.text;
  const ref = detail.identifier?.value ? ` (${detail.identifier.value})` : '';
  return `${amount}${what ? ` ${what.toLowerCase()}` : ''}${ref} didn't match a claim.`;
}

/**
 * One remittance: its payment, posting status, and each line with the claim it paid.
 * @param props - The remittance ID and navigation callbacks.
 * @param props.remitId - The PaymentReconciliation ID.
 * @param props.onClose - Closes the drawer, back to the list.
 * @param props.onOpenClaim - Opens a claim.
 * @returns The detail.
 */
function RemitDetail(props: {
  readonly remitId: string;
  readonly onClose: () => void;
  readonly onOpenClaim: (claimId: string) => void;
}): JSX.Element {
  const { remitId, onClose, onOpenClaim } = props;
  const medplum = useMedplum();
  const [remit, setRemit] = useState<WithId<PaymentReconciliation>>();

  useEffect(() => {
    let active = true;
    medplum
      .readResource('PaymentReconciliation', remitId)
      .then((found) => active && setRemit(found))
      .catch(showErrorNotification);
    return () => {
      active = false;
    };
  }, [medplum, remitId]);

  if (!remit) {
    return <Loading />;
  }
  const status = getRemitStatus(remit);
  const details = remit.detail ?? [];
  const unmatched = details.filter(isUnmatched);

  return (
    <Stack gap="md" p="lg">
      <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
        <Stack gap={0} miw={0}>
          <Text size="xl" fw={800} truncate>
            {remit.paymentIssuer?.display ?? 'Unknown payer'}
          </Text>
          <Text size="sm" c="gray.7" truncate>
            {[remit.paymentIdentifier?.value, formatDate(remit.paymentDate)].filter(Boolean).join(' • ')}
          </Text>
        </Stack>
        <Group gap="xs" wrap="nowrap">
          <Badge color={status.color} variant="light">
            {status.label}
          </Badge>
          <ActionIcon variant="subtle" color="gray" radius="xl" aria-label="Close" onClick={onClose}>
            <IconX size={16} stroke={2} />
          </ActionIcon>
        </Group>
      </Group>
      <Divider />
      {status.label === 'Posting…' && (
        <Alert color="blue" icon={<IconInfoCircle />} title="Posting">
          Matching to claims usually takes a few seconds. If it hasn't finished within an hour, it becomes a posting
          error.
        </Alert>
      )}
      {remit.outcome === 'error' && (
        <Alert color="red" icon={<IconAlertTriangle />} title="Posting error">
          {remit.disposition ?? 'This 835 could not be posted. Nothing from it reached a claim.'}
        </Alert>
      )}
      {remit.status === 'cancelled' && (
        <Alert color="gray" icon={<IconInfoCircle />} title="Payment reversed">
          The payer reversed this payment, so nothing posts from it.
        </Alert>
      )}
      <SimpleGrid cols={4} spacing="xs">
        {[
          ['Payment date', formatDate(remit.paymentDate)],
          ['Total paid', formatMoney(remit.paymentAmount)],
          ['Lines', String(details.length)],
          ['Unmatched', String(unmatched.length)],
        ].map(([label, value]) => (
          <Paper key={label} withBorder radius="md" p="xs">
            <Text size="xs" c="dimmed">
              {label}
            </Text>
            <Text fw={700}>{value}</Text>
          </Paper>
        ))}
      </SimpleGrid>
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Claim</Table.Th>
            <Table.Th>Date</Table.Th>
            <Table.Th ta="right">Amount</Table.Th>
            <Table.Th>Posting</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {details.map((detail, i) => {
            const claimId = detail.request?.reference?.startsWith('Claim/')
              ? detail.request.reference.split('/')[1]
              : undefined;
            return (
              <Table.Tr key={detail.identifier?.value ?? i}>
                <Table.Td>
                  {claimId ? (
                    <Anchor component="button" type="button" size="sm" onClick={() => onOpenClaim(claimId)}>
                      {detail.request?.display ?? `Claim ${claimId.slice(0, 8)}`}
                    </Anchor>
                  ) : (
                    <Text size="sm">{describeUnmatched(detail)}</Text>
                  )}
                </Table.Td>
                <Table.Td>{formatDate(detail.date)}</Table.Td>
                <Table.Td ta="right">{formatMoney(detail.amount)}</Table.Td>
                <Table.Td>
                  <Badge color={claimId ? 'green' : 'orange'} variant="light">
                    {claimId ? 'Posted' : 'Unmatched'}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            );
          })}
          {!details.length && (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text size="sm" c="dimmed" ta="center" py="md">
                  No payment lines on this remittance.
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

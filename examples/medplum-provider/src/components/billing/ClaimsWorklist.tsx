// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Center, Divider, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import type { SearchRequest } from '@medplum/core';
import { DEFAULT_SEARCH_COUNT, formatSearchQuery, parseSearchRequest } from '@medplum/core';
import type { Claim, ClaimResponse, Resource } from '@medplum/fhirtypes';
import type { SearchLoadEvent } from '@medplum/react';
import { SearchControl, useMedplum } from '@medplum/react';
import { IconHourglassEmpty, IconSend } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { setClaimFollowUp } from './claimActions';
import { ClaimActionsModal } from './ClaimActionsModal';
import { ClaimDetailPane } from './ClaimDetailPane';
import { ClaimFollowUpModal } from './ClaimFollowUpModal';
import type { ClaimQueue } from './claimQueues';
import { ALL_OPEN_QUEUE_ID, getClaimQueue, isAgingQueue, sameFilter } from './claimQueues';
import { ClaimsAgingSummary } from './ClaimsAgingSummary';
import { getClaimStatus } from './claimStatus';
import classes from './ClaimsWorklist.module.css';
import type { AgingTotal } from './useClaimsAging';
import { WorklistDrawer } from './WorklistDrawer';

const CLAIM_FIELDS = ['patient', 'created', 'total'];

export interface ClaimsWorklistProps {
  readonly queueId: string;
  readonly claimId?: string;
  /** The URL query, holding the table's own search: columns, filters and sort. */
  readonly query: string;
  readonly agingTotals: AgingTotal[] | undefined;
  /** The width of the area the worklist fills, which sizes the claim drawer. */
  readonly areaWidth: number;
  /** Navigates to a path below the claims root, e.g. `ready` or `all/:claimId?_sort=created`. */
  readonly onNavigate: (path: string) => void;
  /** Called after claims change, so counts and totals can reload. */
  readonly onChanged: () => void;
}

/**
 * The claims in one worklist queue, with the open claim in a drawer over the list. The queue's filters are added to the
 * table's own search but kept out of the URL query, which holds only what the user changed.
 * @param props - The ClaimsWorklist React props.
 * @returns The ClaimsWorklist React node.
 */
export function ClaimsWorklist(props: ClaimsWorklistProps): JSX.Element {
  const { queueId, claimId, query, agingTotals, areaWidth, onNavigate, onChanged } = props;
  const medplum = useMedplum();
  const queue = getClaimQueue(queueId);
  const [version, setVersion] = useState(0);
  const [responses, setResponses] = useState<Record<string, ClaimResponse[]>>({});
  const [actionIds, setActionIds] = useState<string[]>();
  const [submitAll, setSubmitAll] = useState(false);
  const [followUpIds, setFollowUpIds] = useState<string[]>();
  const responsesRequest = useRef(0);

  const queueFilters = useMemo(() => queue.filters?.(new Date()) ?? [], [queue]);

  const search = useMemo((): SearchRequest => {
    const parsed = parseSearchRequest(`Claim${query}`);
    return {
      ...parsed,
      filters: [...queueFilters, ...(parsed.filters ?? [])],
      fields: parsed.fields ?? CLAIM_FIELDS,
      sortRules: parsed.sortRules ?? [{ code: 'created' }],
      count: parsed.count ?? DEFAULT_SEARCH_COUNT,
    };
  }, [query, queueFilters]);

  const path = (nextQueueId: string, nextClaimId?: string, nextQuery = query): string =>
    `${nextQueueId}${nextClaimId ? `/${nextClaimId}` : ''}${nextQuery}`;

  const closeClaim = useCallback(() => onNavigate(`${queue.id}${query}`), [onNavigate, queue.id, query]);

  const changeSearch = (next: SearchRequest): void => {
    const own = (next.filters ?? []).filter((f) => !queueFilters.some((q) => sameFilter(q, f)));
    onNavigate(path(queue.id, claimId, formatSearchQuery({ ...next, filters: own })));
  };

  const loadResponses = useCallback(
    (e: SearchLoadEvent): void => {
      const ids = (e.response.entry ?? [])
        .map((entry) => entry.resource)
        .filter((r): r is Resource => r?.resourceType === 'Claim')
        .map((r) => `Claim/${r.id}`);
      const request = ++responsesRequest.current;
      if (!ids.length) {
        return;
      }
      medplum
        .searchResources('ClaimResponse', { request: ids.join(','), _sort: '_lastUpdated', _count: '1000' })
        .then((found) => {
          const byClaim: Record<string, ClaimResponse[]> = {};
          found.forEach((r) => {
            const id = r.request?.reference?.split('/')[1];
            if (id) {
              (byClaim[id] ??= []).push(r);
            }
          });
          if (request === responsesRequest.current) {
            setResponses(byClaim);
          }
        })
        .catch(console.error);
    },
    [medplum]
  );

  const statusColumns = useMemo(
    () => [
      {
        name: 'Status',
        renderCell: (resource: Resource) => {
          const status = getClaimStatus(resource as Claim, responses[resource.id as string] ?? []);
          return (
            <Badge color={status.color} variant="light" title={status.detail}>
              {status.label}
            </Badge>
          );
        },
      },
    ],
    [responses]
  );

  const changed = (): void => {
    setVersion((v) => v + 1);
    onChanged();
  };

  const showAging = queue.id === ALL_OPEN_QUEUE_ID || isAgingQueue(queue);

  return (
    <div className={classes.root}>
      <div className={classes.main}>
        {showAging && (
          <>
            <ClaimsAgingSummary
              totals={agingTotals}
              selected={isAgingQueue(queue) ? queue.id : undefined}
              onSelect={(bucketId) => onNavigate(path(bucketId ?? ALL_OPEN_QUEUE_ID, claimId))}
            />
            <Divider my="md" />
          </>
        )}
        {queue.id === 'ready' && (
          <Group justify="space-between" mb="sm">
            <Title order={4}>{queue.label}</Title>
            <Button leftSection={<IconSend size={16} />} onClick={() => setSubmitAll(true)}>
              Submit all
            </Button>
          </Group>
        )}
        <div className={classes.listArea}>
          {queue.filters ? (
            <SearchControl
              key={version}
              search={search}
              checkboxesEnabled
              activeResourceId={claimId}
              onLoad={loadResponses}
              onChange={(e) => changeSearch(e.definition)}
              onClick={(e) => onNavigate(path(queue.id, e.resource.id))}
              onAuxClick={(e) => window.open(`/Billing/Claims/${path(queue.id, e.resource.id)}`, '_blank')}
              onBulk={(ids) => setActionIds(ids)}
              additionalColumns={statusColumns}
            />
          ) : (
            <ComingSoonQueue queue={queue} />
          )}
        </div>
        <WorklistDrawer opened={!!claimId} label="Claim" areaWidth={areaWidth} onClose={closeClaim}>
          {claimId && <ClaimDetailPane key={claimId} claimId={claimId} onClose={closeClaim} onChanged={changed} />}
        </WorklistDrawer>
      </div>
      {actionIds && (
        <ClaimActionsModal
          opened
          claimIds={actionIds}
          onClose={() => setActionIds(undefined)}
          onDone={changed}
          onFollowUp={(ids) => {
            setActionIds(undefined);
            setFollowUpIds(ids);
          }}
        />
      )}
      {submitAll && <SubmitAllModal onClose={() => setSubmitAll(false)} onDone={changed} />}
      <ClaimFollowUpModal
        opened={!!followUpIds}
        count={followUpIds?.length ?? 0}
        onClose={() => setFollowUpIds(undefined)}
        onSave={(followUp) => {
          followUpIds?.forEach((id) => setClaimFollowUp(id, followUp));
          setFollowUpIds(undefined);
        }}
      />
    </div>
  );
}

/**
 * Submits every draft claim, not just the current page. Mount it only while open.
 * @param props - The modal props.
 * @param props.onClose - Closes it.
 * @param props.onDone - Called after the claims were submitted.
 * @returns The modal.
 */
function SubmitAllModal(props: { readonly onClose: () => void; readonly onDone: () => void }): JSX.Element | null {
  const medplum = useMedplum();
  const [ids, setIds] = useState<string[]>();

  useEffect(() => {
    let active = true;
    medplum
      .searchResources('Claim', { status: 'draft', _count: '1000', _elements: 'id' }, { cache: 'no-cache' })
      .then((claims) => active && setIds(claims.map((c) => c.id)))
      .catch(showErrorNotification);
    return () => {
      active = false;
    };
  }, [medplum]);

  if (!ids) {
    return null;
  }
  return (
    <ClaimActionsModal
      opened
      claimIds={ids}
      initialAction="submit"
      title="Submit all ready claims"
      onClose={props.onClose}
      onDone={props.onDone}
      onFollowUp={() => undefined}
    />
  );
}

function ComingSoonQueue(props: { readonly queue: ClaimQueue }): JSX.Element {
  return (
    <Center py={80}>
      <Stack align="center" gap="xs" maw={420}>
        <ThemeIcon variant="light" color="gray" size={48} radius="xl">
          <IconHourglassEmpty size={24} />
        </ThemeIcon>
        <Text fw={700}>{props.queue.label} is coming soon</Text>
        <Text size="sm" c="dimmed" ta="center">
          {props.queue.missing}
        </Text>
      </Stack>
    </Center>
  );
}

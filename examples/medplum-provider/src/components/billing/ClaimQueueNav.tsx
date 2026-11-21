// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack } from '@mantine/core';
import { formatSearchQuery } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { Fragment, useEffect, useState } from 'react';
import { BillingNavDivider, BillingNavGroup, BillingNavLink } from './BillingNavLink';
import { AGING_BUCKETS, ALL_ISSUES_QUEUE_ID, CLAIM_QUEUES, isAgingQueue } from './claimQueues';
import type { AgingTotal } from './useClaimsAging';

export interface ClaimQueueNavProps {
  readonly baseUrl: string;
  readonly queueId: string;
  readonly agingTotals: AgingTotal[] | undefined;
  /** The number of claims in All Issues, once the open claims have been checked. */
  readonly issueCount: number | undefined;
  readonly onNavigate: (queueId: string) => void;
  /** Bump to reload the counts. */
  readonly version: number;
}

/**
 * The claims worklist queues as sidebar links, grouped by where the claim is, each with its claim count.
 * @param props - The ClaimQueueNav React props.
 * @returns The ClaimQueueNav React node.
 */
export function ClaimQueueNav(props: ClaimQueueNavProps): JSX.Element {
  const { baseUrl, queueId, agingTotals, issueCount, onNavigate, version } = props;
  const counts = useQueueCounts(version);

  return (
    <Stack gap={2} component="nav" aria-label="Claim queues">
      {CLAIM_QUEUES.map((queue, i) => {
        const showGroup = queue.group && CLAIM_QUEUES[i - 1]?.group !== queue.group;
        const agingIndex = AGING_BUCKETS.findIndex((b) => b.id === queue.id);
        let count: number | undefined = counts[queue.id];
        if (isAgingQueue(queue)) {
          count = agingTotals?.[agingIndex]?.count;
        } else if (queue.id === ALL_ISSUES_QUEUE_ID) {
          count = issueCount;
        }
        return (
          <Fragment key={queue.id}>
            {showGroup && (queue.group === 'Aging' || queue.group === 'Pre-Submission') && <BillingNavDivider />}
            {showGroup && <BillingNavGroup>{queue.group}</BillingNavGroup>}
            <BillingNavLink
              href={`${baseUrl}/${queue.id}`}
              label={queue.label}
              dotColor={queue.color}
              count={count}
              active={queue.id === queueId}
              onNavigate={() => onNavigate(queue.id)}
            />
          </Fragment>
        );
      })}
      <BillingNavDivider />
    </Stack>
  );
}

/**
 * Counts the claims in each searchable queue other than the aging buckets, which are counted with their totals.
 * @param version - Bump to reload.
 * @returns The count per queue ID, filled in as each count arrives.
 */
function useQueueCounts(version: number): Record<string, number> {
  const medplum = useMedplum();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    const today = new Date();
    for (const queue of CLAIM_QUEUES) {
      if (!queue.filters || isAgingQueue(queue)) {
        continue;
      }
      const query = formatSearchQuery({
        resourceType: 'Claim',
        filters: queue.filters(today),
        count: 0,
        total: 'accurate',
      });
      medplum
        .search('Claim', query.slice(1), { cache: 'no-cache' })
        .then((bundle) => {
          if (active && bundle.total !== undefined) {
            setCounts((prev) => ({ ...prev, [queue.id]: bundle.total as number }));
          }
        })
        .catch(console.error);
    }
    return () => {
      active = false;
    };
  }, [medplum, version]);

  return counts;
}

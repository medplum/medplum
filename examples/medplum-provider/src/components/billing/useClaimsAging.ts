// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { AGING_BUCKETS, daysAgo } from './claimQueues';

export interface AgingTotal {
  readonly amount: number;
  readonly count: number;
}

/**
 * Totals the open (active) claims in each aging bucket, by the date each claim was created. Reloads when
 * `version` changes.
 * @param version - Bump to reload, e.g. after claims are submitted.
 * @returns The amount and count in each bucket, in `AGING_BUCKETS` order, or undefined while loading.
 */
export function useClaimsAging(version = 0): AgingTotal[] | undefined {
  const medplum = useMedplum();
  const [totals, setTotals] = useState<AgingTotal[]>();

  useEffect(() => {
    let active = true;
    sumOpenClaims(medplum, new Date())
      .then((result) => active && setTotals(result))
      .catch(showErrorNotification);
    return () => {
      active = false;
    };
  }, [medplum, version]);

  return totals;
}

/**
 * Sums the totals of every open claim into the aging buckets. Pages through all of them, fetching only the
 * fields the totals need.
 * @param medplum - The Medplum client.
 * @param today - Today's date.
 * @returns The amount and count of open claims in each bucket, in `AGING_BUCKETS` order.
 */
async function sumOpenClaims(medplum: MedplumClient, today: Date): Promise<AgingTotal[]> {
  const bounds = AGING_BUCKETS.map((bucket) => ({
    from: bucket.maxDays !== undefined ? daysAgo(today, bucket.maxDays) : undefined,
    to: bucket.minDays > 0 ? daysAgo(today, bucket.minDays) : undefined,
  }));
  const totals = AGING_BUCKETS.map(() => ({ amount: 0, count: 0 }));
  for await (const page of medplum.searchResourcePages('Claim', {
    status: 'active',
    _elements: 'created,total',
    _count: '1000',
  })) {
    for (const claim of page) {
      const created = claim.created?.slice(0, 10);
      const i = bounds.findIndex(({ from, to }) => !!created && (!from || created >= from) && (!to || created <= to));
      if (i >= 0) {
        totals[i].amount += claim.total?.value ?? 0;
        totals[i].count += 1;
      }
    }
  }
  return totals;
}

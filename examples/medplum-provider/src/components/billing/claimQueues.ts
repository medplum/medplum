// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter } from '@medplum/core';
import { Operator } from '@medplum/core';
import { toLocalCalendarDate } from '../../utils/candid';

/**
 * A claims worklist queue. A queue is a fixed set of search filters on Claim, so it reads and pages like any
 * other search. A queue without `filters` has no searchable data behind it yet and shows as coming soon.
 */
export interface ClaimQueue {
  readonly id: string;
  readonly label: string;
  readonly group?: 'Aging' | 'Before Submission' | 'With Payer' | 'After Payment';
  /** The Mantine color of the queue's dot in the nav. */
  readonly color: string;
  readonly filters?: (today: Date) => Filter[];
  /** Why a queue without filters can't be listed yet. */
  readonly missing?: string;
}

/** An accounts receivable aging bucket: open claims created between `minDays` and `maxDays` days ago. */
export interface AgingBucket {
  readonly id: string;
  readonly label: string;
  readonly minDays: number;
  readonly maxDays?: number;
}

export const AGING_BUCKETS: AgingBucket[] = [
  { id: 'aging-0-30', label: '0–30 Days', minDays: 0, maxDays: 30 },
  { id: 'aging-31-60', label: '31–60 Days', minDays: 31, maxDays: 60 },
  { id: 'aging-61-90', label: '61–90 Days', minDays: 61, maxDays: 90 },
  { id: 'aging-over-90', label: 'Over 90 Days', minDays: 91 },
];

const AGING_COLORS = ['gray', 'yellow', 'orange', 'red'];

const OPEN: Filter = { code: 'status', operator: Operator.EQUALS, value: 'draft,active' };
const ACTIVE: Filter = { code: 'status', operator: Operator.EQUALS, value: 'active' };

/**
 * Filters to claims with a ClaimResponse that has the given outcome.
 * @param outcome - The ClaimResponse outcome code.
 * @returns The reverse-chained filter.
 */
function withOutcome(outcome: string): Filter {
  return { code: '_has:ClaimResponse:request:outcome', operator: Operator.EQUALS, value: outcome };
}

export const ALL_OPEN_QUEUE_ID = 'all';

export const CLAIM_QUEUES: ClaimQueue[] = [
  { id: ALL_OPEN_QUEUE_ID, label: 'All open', color: 'dark', filters: () => [OPEN] },
  ...AGING_BUCKETS.map((bucket, i): ClaimQueue => ({
    id: bucket.id,
    label: bucket.label,
    group: 'Aging',
    color: AGING_COLORS[i],
    filters: (today) => [ACTIVE, ...getAgingFilters(bucket, today)],
  })),
  {
    id: 'unbilled',
    label: 'Unbilled',
    group: 'Before Submission',
    color: 'gray',
    missing: 'Signed encounters with charges but no claim. This needs a billing status on ChargeItem.',
  },
  {
    id: 'ready',
    label: 'Ready to submit',
    group: 'Before Submission',
    color: 'blue',
    filters: () => [{ code: 'status', operator: Operator.EQUALS, value: 'draft' }],
  },
  {
    id: 'needs-fixing',
    label: 'Needs fixing',
    group: 'Before Submission',
    color: 'orange',
    missing: 'Draft claims with failing pre-submit checks. This needs check results stored on the claim.',
  },
  {
    id: 'awaiting-payer',
    label: 'Awaiting payer',
    group: 'With Payer',
    color: 'violet',
    filters: () => [ACTIVE, withOutcome('queued')],
  },
  {
    id: 'rejected',
    label: 'Rejected',
    group: 'With Payer',
    color: 'red',
    missing: 'Claims the clearinghouse or payer rejected. This needs a search parameter for the payer status.',
  },
  {
    id: 'denied',
    label: 'Denied',
    group: 'With Payer',
    color: 'red',
    missing: 'Claims the payer denied. This needs a search parameter for the payer status.',
  },
  {
    id: 'patient-balance',
    label: 'Patient balance',
    group: 'After Payment',
    color: 'yellow',
    missing: 'Claims with a patient share still owed. This needs a patient responsibility model.',
  },
  {
    id: 'paid-incorrectly',
    label: 'Paid incorrectly',
    group: 'After Payment',
    color: 'yellow',
    missing: 'Claims paid off the contracted rate. This needs a search parameter for the payer status.',
  },
  {
    id: 'paid',
    label: 'Paid & closed',
    group: 'After Payment',
    color: 'green',
    filters: () => [withOutcome('complete')],
  },
];

/**
 * Finds a queue by ID, falling back to All open.
 * @param id - The queue ID from the URL.
 * @returns The queue.
 */
export function getClaimQueue(id: string | undefined): ClaimQueue {
  return CLAIM_QUEUES.find((q) => q.id === id?.toLowerCase()) ?? CLAIM_QUEUES[0];
}

/**
 * Whether a queue is one of the aging buckets.
 * @param queue - The queue.
 * @returns True for an aging queue.
 */
export function isAgingQueue(queue: ClaimQueue): boolean {
  return queue.group === 'Aging';
}

/**
 * The `created` filters that match an aging bucket, as calendar dates in the local time zone.
 * @param bucket - The aging bucket.
 * @param today - Today's date.
 * @returns The filters bounding the claim's created date.
 */
export function getAgingFilters(bucket: AgingBucket, today: Date): Filter[] {
  const filters: Filter[] = [];
  if (bucket.maxDays !== undefined) {
    filters.push({ code: 'created', operator: Operator.GREATER_THAN_OR_EQUALS, value: daysAgo(today, bucket.maxDays) });
  }
  if (bucket.minDays > 0) {
    filters.push({ code: 'created', operator: Operator.LESS_THAN_OR_EQUALS, value: daysAgo(today, bucket.minDays) });
  }
  return filters;
}

export function daysAgo(today: Date, days: number): string {
  const date = new Date(today);
  date.setDate(date.getDate() - days);
  return toLocalCalendarDate(date);
}

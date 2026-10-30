// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Claim, ClaimResponse, ClaimResponseItem, Money } from '@medplum/fhirtypes';
import { getCandidClaimStatus } from '../../utils/candid';
import { formatStediClaimStatus, getStediClaimStatus } from '../../utils/stedi';

export type ClaimStage =
  | 'ready'
  | 'submitted'
  | 'awaiting-payer'
  | 'awaiting-remit'
  | 'rejected'
  | 'denied'
  | 'paid'
  | 'paid-incorrectly'
  | 'voided';

/** Where a claim is in its lifecycle, as the worklist shows it. */
export interface ClaimDisplayStatus {
  readonly stage: ClaimStage;
  readonly label: string;
  /** The Mantine color for the status badge. */
  readonly color: string;
  /** The clearinghouse's own status, when it adds something the label doesn't, e.g. "Submitted To Payer". */
  readonly detail?: string;
}

const STAGES: Record<ClaimStage, Omit<ClaimDisplayStatus, 'stage' | 'detail'>> = {
  ready: { label: 'Ready', color: 'blue' },
  submitted: { label: 'Submitted', color: 'violet' },
  'awaiting-payer': { label: 'Awaiting payer', color: 'violet' },
  'awaiting-remit': { label: 'Awaiting remit', color: 'violet' },
  rejected: { label: 'Rejected', color: 'red' },
  denied: { label: 'Denied', color: 'red' },
  paid: { label: 'Paid', color: 'green' },
  'paid-incorrectly': { label: 'Paid incorrectly', color: 'yellow' },
  voided: { label: 'Voided', color: 'gray' },
};

/**
 * Works out a claim's stage from the claim and the response the clearinghouse sync bots keep up to date. The
 * Candid or Stedi status wins when present, since it is more precise than the FHIR outcome.
 * @param claim - The claim.
 * @param response - The claim's latest ClaimResponse, if it has one.
 * @returns The stage, its label and badge color.
 */
export function getClaimDisplayStatus(claim: Claim, response?: ClaimResponse): ClaimDisplayStatus {
  const stage = (s: ClaimStage, detail?: string): ClaimDisplayStatus => ({ stage: s, ...STAGES[s], detail });
  if (claim.status === 'cancelled' || claim.status === 'entered-in-error') {
    return stage('voided');
  }
  if (claim.status === 'draft') {
    return stage('ready');
  }
  if (!response) {
    return stage('submitted');
  }

  const candid = getCandidClaimStatus(response);
  if (candid) {
    switch (candid) {
      case 'rejected':
        return stage('rejected');
      case 'denied':
      case 'finalized_denied':
        return stage('denied');
      case 'paid':
      case 'finalized_paid':
        return stage('paid');
      case 'paid_incorrectly':
        return stage('paid-incorrectly');
      default:
        return stage('awaiting-payer', formatCode(candid));
    }
  }

  const stedi = getStediClaimStatus(response);
  if (stedi) {
    if (stedi.code?.startsWith('E')) {
      return stage('rejected');
    }
    return stage(stedi.code?.startsWith('F') ? 'paid' : 'awaiting-payer', formatStediClaimStatus(stedi));
  }

  switch (response.outcome) {
    case 'error':
      return stage('rejected');
    case 'complete':
      return stage(isRemitResponse(response) ? 'paid' : 'awaiting-payer');
    default:
      return stage('awaiting-payer');
  }
}

/**
 * Whether a ClaimResponse posts a remittance (payment or line adjudication) rather than tracking the claim's status.
 * A claim has one tracker, kept up to date by the clearinghouse status sync, and a remit response per payment.
 * @param response - The ClaimResponse.
 * @returns True for a remit response.
 */
export function isRemitResponse(response: ClaimResponse): boolean {
  return !!response.payment || !!response.item?.some((item) => item.adjudication?.length);
}

/**
 * Works out a claim's stage from all of its responses, oldest first: the newest tracker's status, unless a remit has
 * posted while the tracker still says the claim is with the payer. A claim the clearinghouse reports paid isn't Paid
 * until its remit posts.
 * @param claim - The claim.
 * @param responses - The claim's ClaimResponses, oldest first.
 * @returns The stage, its label and badge color.
 */
export function getClaimStatus(claim: Claim, responses: ClaimResponse[]): ClaimDisplayStatus {
  const tracker = responses.findLast((r) => !isRemitResponse(r));
  const remit = responses.findLast(isRemitResponse);
  const status = getClaimDisplayStatus(claim, tracker);
  if (remit && (status.stage === 'submitted' || status.stage === 'awaiting-payer')) {
    return getClaimDisplayStatus(claim, remit);
  }
  if (!remit && (status.stage === 'paid' || status.stage === 'paid-incorrectly')) {
    return { ...status, stage: 'awaiting-remit', ...STAGES['awaiting-remit'] };
  }
  return status;
}

/**
 * Formats a snake_case clearinghouse code for display, e.g. `submitted_to_payer` as "Submitted To Payer".
 * @param code - The code.
 * @returns The display text.
 */
export function formatCode(code: string): string {
  return code
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

const ADJUDICATION_SYSTEM = 'http://terminology.hl7.org/CodeSystem/adjudication';

/**
 * Sums the adjudication amounts of a category on a response line, e.g. `eligible` (allowed) or `benefit` (paid).
 * @param item - The response line.
 * @param categories - The adjudication category codes to add up.
 * @returns The total, or undefined when the line has none of them.
 */
export function getAdjudicationAmount(
  item: ClaimResponseItem | undefined,
  ...categories: string[]
): number | undefined {
  const amounts = (item?.adjudication ?? [])
    .filter((a) =>
      a.category.coding?.some(
        (c) => (!c.system || c.system === ADJUDICATION_SYSTEM) && categories.includes(c.code ?? '')
      )
    )
    .map((a) => a.amount?.value ?? 0);
  return amounts.length ? amounts.reduce((sum, v) => sum + v, 0) : undefined;
}

/**
 * Sums the adjudication amounts of a category across response lines, e.g. one claim line's entries in every remit.
 * @param items - The response lines.
 * @param categories - The adjudication category codes to add up.
 * @returns The total, or undefined when none of the lines has them.
 */
export function sumAdjudicationAmount(items: ClaimResponseItem[], ...categories: string[]): number | undefined {
  const amounts = items.map((item) => getAdjudicationAmount(item, ...categories)).filter((v) => v !== undefined);
  return amounts.length ? amounts.reduce((sum, v) => sum + v, 0) : undefined;
}

/**
 * The adjustment reason codes on a response line, e.g. CARC `CO-45`.
 * @param item - The response line.
 * @returns The reason codes with their amounts.
 */
export function getAdjustmentReasons(item: ClaimResponseItem | undefined): { code: string; amount?: Money }[] {
  return (item?.adjudication ?? [])
    .filter((a) => a.reason?.coding?.[0]?.code)
    .map((a) => ({ code: a.reason?.coding?.[0]?.code as string, amount: a.amount }));
}

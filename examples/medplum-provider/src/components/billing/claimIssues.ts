// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { formatMoney } from '@medplum/core';
import type { Claim, ClaimResponse } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { isPatientBalanceCollected } from './claimActions';
import { getClaimStatus, isRemitResponse } from './claimStatus';
import type { ClaimIssue } from './preSubmitChecks';
import { getPreSubmitIssues } from './preSubmitChecks';

const PATIENT_CATEGORIES = ['deductible', 'copay', 'coinsurance'];

/**
 * What the patient owes after the payer's adjudication: the deductible, copay and coinsurance amounts, plus any other
 * adjustment in the patient responsibility (PR) group. Each adjudication counts once.
 * @param remits - The claim's remit responses.
 * @returns The patient's share, or undefined when no remit has one.
 */
export function getPatientResponsibility(remits: ClaimResponse[]): number | undefined {
  const amounts = remits
    .flatMap((r) => r.item ?? [])
    .flatMap((item) => item.adjudication ?? [])
    .filter(
      (a) =>
        a.category.coding?.some((c) => PATIENT_CATEGORIES.includes(c.code ?? '')) ||
        a.reason?.coding?.some((c) => c.code?.startsWith('PR-'))
    )
    .map((a) => a.amount?.value ?? 0);
  return amounts.length ? amounts.reduce((sum, v) => sum + v, 0) : undefined;
}

/**
 * Everything about a claim that needs someone's attention, across stages: pre-submit problems on a draft, a
 * rejection or denial, an underpayment, and a patient share still to collect once a remit posts.
 * @param claim - The claim.
 * @param responses - The claim's ClaimResponses, oldest first.
 * @returns The issues, most pressing first; empty when nothing needs doing.
 */
export function getClaimIssues(claim: WithId<Claim>, responses: ClaimResponse[]): ClaimIssue[] {
  const status = getClaimStatus(claim, responses);
  const issues: ClaimIssue[] = [];
  switch (status.stage) {
    case 'needs-fixing':
      return getPreSubmitIssues(claim);
    case 'rejected':
      issues.push({
        code: 'rejected',
        label: 'Rejected',
        color: 'red',
        detail: 'The clearinghouse or payer rejected the claim. Fix it and resubmit.',
      });
      break;
    case 'denied':
      issues.push({ code: 'denied', label: 'Denied', color: 'red', detail: 'The payer denied the claim.' });
      break;
    case 'paid-incorrectly':
      issues.push({
        code: 'paid-incorrectly',
        label: 'Paid incorrectly',
        color: 'yellow',
        detail: "The payer's allowed amount doesn't match the contracted rate.",
      });
      break;
    case 'ready':
    case 'voided':
      return [];
    default:
      break;
  }
  const owed = getPatientResponsibility(responses.filter(isRemitResponse));
  if (owed && owed > 0 && !isPatientBalanceCollected(claim.id)) {
    issues.push({
      code: 'patient-balance',
      label: 'Patient owes',
      color: 'yellow',
      detail: `The patient owes ${formatMoney({ value: owed, currency: 'USD' })} after the payer's adjudication.`,
    });
  }
  return issues;
}

/** The most claims All Issues lists, since they're found by ID and the IDs go in the search URL. */
export const MAX_ISSUE_CLAIMS = 200;

const RESPONSE_CHUNK = 50;

/** The open claims that have issues, oldest first. */
export interface ClaimIssueScan {
  /** The issues per claim ID, for claims with at least one. */
  readonly byClaim: Record<string, ClaimIssue[]>;
  /** The claims with issues, oldest first. */
  readonly ids: string[];
}

/**
 * Checks every open claim for issues. Most of them can't be searched for, e.g. a line without a diagnosis pointer,
 * a denial, or a patient share, so this reads each open claim and its responses.
 * @param medplum - The Medplum client.
 * @returns The claims with issues.
 */
export async function scanClaimIssues(medplum: MedplumClient): Promise<ClaimIssueScan> {
  const claims: WithId<Claim>[] = [];
  for await (const page of medplum.searchResourcePages(
    'Claim',
    { status: 'draft,active', _sort: 'created', _count: '1000' },
    { cache: 'no-cache' }
  )) {
    claims.push(...page);
  }

  const responses: Record<string, ClaimResponse[]> = {};
  const submitted = claims.filter((c) => c.status !== 'draft');
  for (let i = 0; i < submitted.length; i += RESPONSE_CHUNK) {
    const request = submitted
      .slice(i, i + RESPONSE_CHUNK)
      .map((c) => `Claim/${c.id}`)
      .join(',');
    for await (const page of medplum.searchResourcePages(
      'ClaimResponse',
      { request, _sort: '_lastUpdated', _count: '1000' },
      { cache: 'no-cache' }
    )) {
      for (const r of page) {
        const id = r.request?.reference?.split('/')[1];
        if (id) {
          (responses[id] ??= []).push(r);
        }
      }
    }
  }

  const byClaim: Record<string, ClaimIssue[]> = {};
  const ids: string[] = [];
  for (const claim of claims) {
    const issues = getClaimIssues(claim, responses[claim.id] ?? []);
    if (issues.length) {
      byClaim[claim.id] = issues;
      ids.push(claim.id);
    }
  }
  return { byClaim, ids };
}

/**
 * Scans the open claims for issues, reloading when `version` changes.
 * @param version - Bump to reload, e.g. after a claim changes.
 * @returns The scan, or undefined while loading.
 */
export function useClaimIssues(version = 0): ClaimIssueScan | undefined {
  const medplum = useMedplum();
  const [scan, setScan] = useState<ClaimIssueScan>();

  useEffect(() => {
    let active = true;
    scanClaimIssues(medplum)
      .then((result) => active && setScan(result))
      .catch(showErrorNotification);
    return () => {
      active = false;
    };
  }, [medplum, version]);

  return scan;
}

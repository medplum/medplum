// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { Annotation, Claim } from '@medplum/fhirtypes';
import { getCandidEncounterId, refreshCandidClaimResponse } from '../../utils/candid';

export type ClaimActionId = 'submit' | 'refresh' | 'follow-up' | 'rerun-edits' | 'write-off';

export interface ClaimAction {
  readonly id: ClaimActionId;
  readonly label: string;
  /** Set when there is no backend for the action yet; it shows disabled. */
  readonly comingSoon?: boolean;
  /** Whether the action applies to a claim, and if not, why. */
  readonly check: (claim: Claim) => string | undefined;
}

export const CLAIM_ACTIONS: ClaimAction[] = [
  {
    id: 'submit',
    label: 'Submit',
    check: (claim) => {
      if (claim.status !== 'draft') {
        return 'Already submitted';
      }
      return claim.insurance?.length ? undefined : 'No coverage on the claim';
    },
  },
  {
    id: 'refresh',
    label: 'Refresh status',
    check: (claim) => (getCandidEncounterId(claim) ? undefined : 'Not submitted to Candid'),
  },
  { id: 'follow-up', label: 'Set follow-up', check: () => undefined },
  { id: 'rerun-edits', label: 'Re-run edits', comingSoon: true, check: () => undefined },
  { id: 'write-off', label: 'Write off', comingSoon: true, check: () => undefined },
];

/**
 * Submits a draft claim to Candid. The claim already carries its coverages, so it goes as is.
 * @param medplum - The Medplum client.
 * @param claim - The draft claim.
 */
export async function submitClaim(medplum: MedplumClient, claim: WithId<Claim>): Promise<void> {
  await medplum.post(medplum.fhirUrl('Claim', claim.id, '$candid-submit-claim'), {
    resourceType: 'Parameters',
    parameter: [],
  });
}

/**
 * Pulls a claim's latest status from Candid.
 * @param medplum - The Medplum client.
 * @param claim - The submitted claim.
 */
export async function refreshClaim(medplum: MedplumClient, claim: WithId<Claim>): Promise<void> {
  const ran = await refreshCandidClaimResponse(medplum, claim);
  if (!ran) {
    throw new Error('The Candid status bot is not deployed in this project');
  }
}

/** The result of running an action on one claim. */
export interface ClaimActionResult {
  readonly claim: WithId<Claim>;
  readonly error?: string;
}

/**
 * Runs an action on each claim in turn, so one failure doesn't stop the rest.
 * @param claims - The claims.
 * @param run - Runs the action on one claim.
 * @returns A result per claim.
 */
export async function runOnEach(
  claims: WithId<Claim>[],
  run: (claim: WithId<Claim>) => Promise<void>
): Promise<ClaimActionResult[]> {
  const results: ClaimActionResult[] = [];
  for (const claim of claims) {
    try {
      await run(claim);
      results.push({ claim });
    } catch (err) {
      results.push({ claim, error: normalizeErrorString(err) });
    }
  }
  return results;
}

/** A follow-up date and the reason for it. */
export interface ClaimFollowUp {
  readonly date: string;
  readonly note: string;
}

// Notes and follow-ups are not saved yet: they live in memory for the session, until the data model for claim
// work items is decided.
const notes = new Map<string, Annotation[]>();
const followUps = new Map<string, ClaimFollowUp>();

export function getClaimNotes(claimId: string): Annotation[] {
  return notes.get(claimId) ?? [];
}

export function addClaimNote(claimId: string, note: Annotation): Annotation[] {
  const next = [...getClaimNotes(claimId), note];
  notes.set(claimId, next);
  return next;
}

export function getClaimFollowUp(claimId: string): ClaimFollowUp | undefined {
  return followUps.get(claimId);
}

export function setClaimFollowUp(claimId: string, followUp: ClaimFollowUp): void {
  followUps.set(claimId, followUp);
}

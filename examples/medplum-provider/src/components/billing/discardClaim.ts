// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import type { Claim, ClaimResponse } from '@medplum/fhirtypes';
import { isBillingClaim } from './claimSync';

/**
 * Whether a claim can be discarded: one that was never submitted.
 * @param claim - The claim.
 * @param responses - Its claim responses.
 * @returns Whether it can be discarded.
 */
export function canDiscardClaim(claim: Claim, responses: ClaimResponse[]): boolean {
  return isBillingClaim(claim) && !responses.length;
}

/**
 * Discards a claim that was never submitted: marks it entered in error, so it's kept but out of every list. Its charge
 * items stay on the visit, on no claim, until they're put on another.
 * @param medplum - The Medplum client.
 * @param claim - The claim to discard.
 */
export async function discardClaim(medplum: MedplumClient, claim: WithId<Claim>): Promise<void> {
  await medplum.updateResource<Claim>({ ...claim, status: 'entered-in-error' });
}

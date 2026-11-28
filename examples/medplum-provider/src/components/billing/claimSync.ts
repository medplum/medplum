// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { ChargeItem, Claim, ClaimDiagnosis, ClaimItem, Encounter, Patient } from '@medplum/fhirtypes';
import { getClaimChargeItemIds, getCptChargeItems } from '../../utils/claims';
import { applyPlaceOfService } from '../../utils/placeOfService';
import { finishClaimEdit } from './claimEditing';
import { isClaimEditable } from './claimStatus';
import { getLineChargeItemId } from './lineHistory';
import type { VisitClaim } from './visitDetails';
import { findVisitClaims } from './visitDetails';

/** How a visit's charge items changed in one save. */
export interface ChargeItemChanges {
  /** The charge items as they were before the save, by id. */
  readonly previous: ReadonlyMap<string, ChargeItem>;
  /** The charge items now. */
  readonly current: readonly WithId<ChargeItem>[];
  /** The ids of the charge items the save created. */
  readonly created: ReadonlySet<string>;
}

/**
 * Whether a claim bills: it's open or submitted, not cancelled or discarded.
 * @param claim - The claim.
 * @returns Whether it bills.
 */
export function isBillingClaim(claim: Claim): boolean {
  return claim.status === 'draft' || claim.status === 'active';
}

/**
 * The ids of the visit's charge items that are on a claim, open or submitted.
 * @param claims - The visit's claims.
 * @returns The charge item ids.
 */
export function getBilledChargeItemIds(claims: readonly VisitClaim[]): Set<string> {
  return new Set(claims.filter((v) => isBillingClaim(v.claim)).flatMap((v) => getClaimChargeItemIds(v.claim)));
}

// Each part of a line a charge item sets, how to compare it, and which of the line's fields it carries.
const LINE_FIELDS: { readonly value: (line: ClaimItem) => string; readonly keys: (keyof ClaimItem)[] }[] = [
  { value: (l) => l.productOrService?.coding?.[0]?.code ?? '', keys: ['productOrService'] },
  { value: (l) => (l.modifier ?? []).map((m) => m.coding?.[0]?.code).join(','), keys: ['modifier'] },
  { value: (l) => String(l.quantity?.value ?? 1), keys: ['quantity'] },
  { value: (l) => String(l.net?.value ?? ''), keys: ['net', 'unitPrice'] },
  { value: (l) => (l.diagnosisSequence ?? []).join(','), keys: ['diagnosisSequence'] },
];

/**
 * Brings one open claim up to date with the visit's charge items. A line whose charge item was deleted comes off; a
 * changed charge item updates each part of its line the claim hasn't changed itself, so the claim's own edits, like a
 * payer's code or a modifier, stay. Lines added on the claim are left alone.
 * @param claim - The open claim.
 * @param encounter - The visit.
 * @param changes - How the charge items changed.
 * @param added - Charge items to add to the claim as new lines.
 * @returns The claim, brought up to date.
 */
export function syncClaimLines(
  claim: Claim,
  encounter: Encounter,
  changes: ChargeItemChanges,
  added: readonly ChargeItem[] = []
): Claim {
  const current = new Map(changes.current.map((c) => [c.id, c]));
  const encounterRef = createReference(encounter as WithId<Encounter>);

  // The diagnoses this claim's lines point to, added to it when it doesn't have them yet. Others stay off it.
  const onClaim = new Set(getClaimChargeItemIds(claim));
  const diagnosis: ClaimDiagnosis[] = [...(claim.diagnosis ?? [])];
  const codes = new Set(diagnosis.map((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code));
  for (const chargeItem of [...changes.current.filter((c) => onClaim.has(c.id)), ...added]) {
    for (const reason of chargeItem.reason ?? []) {
      const coding = reason.coding?.[0];
      if (coding?.code && !codes.has(coding.code)) {
        codes.add(coding.code);
        diagnosis.push({ sequence: diagnosis.length + 1, diagnosisCodeableConcept: { coding: [coding] } });
      }
    }
  }
  const toLine = (chargeItem: ChargeItem): ClaimItem | undefined =>
    getCptChargeItems([chargeItem], encounterRef, diagnosis)[0];

  const items = (claim.item ?? []).flatMap((line): ClaimItem[] => {
    const id = getLineChargeItemId(line, false);
    if (!id) {
      return [line];
    }
    const now = current.get(id);
    const before = changes.previous.get(id);
    if (!now) {
      // Deleted from the visit, so it comes off the claim.
      return before ? [] : [line];
    }
    const fresh = toLine(now);
    const old = before && toLine(before);
    if (!fresh || !old) {
      return [line];
    }
    let next = line;
    for (const field of LINE_FIELDS) {
      if (field.value(line) === field.value(old) && field.value(fresh) !== field.value(old)) {
        next = { ...next };
        for (const key of field.keys) {
          (next as unknown as Record<string, unknown>)[key] = fresh[key];
        }
      }
    }
    return [next];
  });

  const newLines = applyPlaceOfService(
    added.map(toLine).filter((l): l is ClaimItem => !!l),
    encounter
  );
  return finishClaimEdit({
    ...claim,
    ...(diagnosis.length ? { diagnosis } : {}),
    item: [...items, ...newLines],
  });
}

/**
 * Brings the visit's open claims up to date after its charge items are saved. Each change goes to the claim that has
 * that charge item. A new charge item goes on the visit's open claim when there's exactly one; otherwise it's left off
 * every claim, for the biller to put on one. Submitted claims never change.
 * @param medplum - The Medplum client.
 * @param patient - The visit's patient.
 * @param encounter - The visit.
 * @param changes - How the charge items changed.
 * @returns Whether any claim changed.
 */
export async function syncVisitClaims(
  medplum: MedplumClient,
  patient: WithId<Patient>,
  encounter: WithId<Encounter>,
  changes: ChargeItemChanges
): Promise<boolean> {
  const claims = await findVisitClaims(medplum, createReference(patient), createReference(encounter));
  const open = claims.filter((v) => isBillingClaim(v.claim) && isClaimEditable(v.claim, v.responses));
  const billed = getBilledChargeItemIds(claims);
  const added = changes.current.filter((c) => changes.created.has(c.id) && !billed.has(c.id));
  let changed = false;
  for (const { claim } of open) {
    const next = syncClaimLines(claim, encounter, changes, open.length === 1 ? added : []);
    if (JSON.stringify(next) !== JSON.stringify(finishClaimEdit(claim))) {
      await medplum.updateResource(next);
      changed = true;
    }
  }
  return changed;
}

/**
 * Adds charge items to an open claim as new lines.
 * @param medplum - The Medplum client.
 * @param claim - The open claim.
 * @param encounter - The visit.
 * @param chargeItems - The charge items to add.
 * @returns The updated claim.
 */
export async function addChargeItemsToClaim(
  medplum: MedplumClient,
  claim: WithId<Claim>,
  encounter: WithId<Encounter>,
  chargeItems: readonly WithId<ChargeItem>[]
): Promise<WithId<Claim>> {
  const unchanged: ChargeItemChanges = { previous: new Map(), current: [], created: new Set() };
  return medplum.updateResource(syncClaimLines(claim, encounter, unchanged, chargeItems));
}

/**
 * Takes charge items off the open claims that have them, e.g. once they're moved onto a new claim.
 * @param medplum - The Medplum client.
 * @param claims - The visit's claims.
 * @param chargeItemIds - The charge items to take off.
 * @param except - A claim to leave alone, e.g. the one they moved to.
 */
export async function removeChargeItemsFromClaims(
  medplum: MedplumClient,
  claims: readonly VisitClaim[],
  chargeItemIds: ReadonlySet<string>,
  except?: string
): Promise<void> {
  for (const { claim, responses } of claims) {
    if (claim.id === except || !isBillingClaim(claim) || !isClaimEditable(claim, responses)) {
      continue;
    }
    const kept = (claim.item ?? []).filter((line) => !chargeItemIds.has(getLineChargeItemId(line, false) ?? ''));
    if (kept.length !== (claim.item ?? []).length) {
      await medplum.updateResource(finishClaimEdit({ ...claim, item: kept }));
    }
  }
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { CPT, formatMoney } from '@medplum/core';
import type { Bundle, ChargeItem, Claim, ClaimItem, Condition, Reference } from '@medplum/fhirtypes';
import { getChargeItemModifiers } from '../../utils/chargeitems';
import { LINE_ADDED_URL, LINE_CHARGE_ITEM_URL } from '../../utils/claims';

/** What a service line bills, in the terms its history is told in. */
export interface LineSnapshot {
  readonly code?: string;
  readonly modifiers: string[];
  readonly units: number;
  readonly price?: number;
  /** The ICD-10 codes the line points to. */
  readonly diagnoses: string[];
}

/** One saved change to a service line: who made it, when, and what changed. */
export interface LineChange {
  readonly time?: string;
  readonly author?: Reference;
  readonly changes: string[];
}

/**
 * A charge item as a line snapshot.
 * @param chargeItem - The charge item.
 * @returns The snapshot.
 */
export function chargeItemSnapshot(chargeItem: ChargeItem): LineSnapshot {
  return {
    code: chargeItem.code?.coding?.find((c) => c.system === CPT)?.code ?? chargeItem.code?.coding?.[0]?.code,
    modifiers: (getChargeItemModifiers(chargeItem) ?? []).map((m) => m.coding?.[0]?.code ?? '').filter(Boolean),
    units: chargeItem.quantity?.value ?? 1,
    price: chargeItem.priceOverride?.value,
    diagnoses: (chargeItem.reason ?? []).map((r) => r.coding?.[0]?.code ?? '').filter(Boolean),
  };
}

/**
 * A claim line as a line snapshot, its pointers read as the codes they point to on that version of the claim.
 * @param claim - The claim the line is on.
 * @param item - The line.
 * @returns The snapshot.
 */
export function claimItemSnapshot(claim: Claim, item: ClaimItem): LineSnapshot {
  return {
    code: item.productOrService?.coding?.[0]?.code,
    modifiers: (item.modifier ?? []).map((m) => m.coding?.[0]?.code ?? '').filter(Boolean),
    units: item.quantity?.value ?? 1,
    price: item.net?.value,
    diagnoses: (item.diagnosisSequence ?? [])
      .map((s) => claim.diagnosis?.find((d) => d.sequence === s)?.diagnosisCodeableConcept?.coding?.[0]?.code ?? '')
      .filter(Boolean),
  };
}

/**
 * Describes how a line changed between two versions, e.g. "Changed CPT: 99213 → 99214".
 * @param prev - The earlier version; none when the line was just added.
 * @param next - The later version.
 * @param added - How to describe the line's first version, e.g. "Added CPT: 99213".
 * @returns One description per field that changed.
 */
export function describeLineChanges(
  prev: LineSnapshot | undefined,
  next: LineSnapshot,
  added: (code: string) => string = (code) => `Added CPT: ${code}`
): string[] {
  if (!prev) {
    return [added(next.code ?? '(no code)')];
  }
  const list = (values: string[]): string => (values.length ? values.join(', ') : 'none');
  const money = (value: number | undefined): string =>
    value === undefined ? 'none' : formatMoney({ value, currency: 'USD' });
  const changes: string[] = [];
  if (prev.code !== next.code) {
    changes.push(`Changed CPT: ${prev.code ?? 'none'} → ${next.code ?? 'none'}`);
  }
  if (list(prev.modifiers) !== list(next.modifiers)) {
    changes.push(`Changed modifiers: ${list(prev.modifiers)} → ${list(next.modifiers)}`);
  }
  if (prev.units !== next.units) {
    changes.push(`Changed units: ${prev.units} → ${next.units}`);
  }
  if (prev.price !== next.price) {
    changes.push(`Changed price: ${money(prev.price)} → ${money(next.price)}`);
  }
  if (list(prev.diagnoses) !== list(next.diagnoses)) {
    changes.push(`Changed diagnoses: ${list(prev.diagnoses)} → ${list(next.diagnoses)}`);
  }
  return changes;
}

/**
 * The charge item a line bills: from the line's link to it, or, on the visit, the line's own id.
 * @param item - The line.
 * @param onVisit - Whether the line is one of the visit's own lines, whose id is its charge item's.
 * @returns The charge item id, if the line has a saved one.
 */
export function getLineChargeItemId(item: ClaimItem, onVisit: boolean): string | undefined {
  const linked = item.extension?.find((e) => e.url === LINE_CHARGE_ITEM_URL)?.valueReference?.reference;
  if (linked?.startsWith('ChargeItem/')) {
    return linked.slice('ChargeItem/'.length);
  }
  return onVisit && item.id && !item.id.startsWith('new-') ? item.id : undefined;
}

/**
 * The full history of a service line, newest first: each version of its charge item, then, on a claim, each version
 * of the claim that changed the line. Versions that didn't change the line are left out.
 * @param medplum - The Medplum client.
 * @param item - The line.
 * @param claimId - The claim the line is on; none for the visit's own lines.
 * @returns The changes, newest first.
 */
export async function loadLineHistory(
  medplum: MedplumClient,
  item: ClaimItem,
  claimId: string | undefined
): Promise<LineChange[]> {
  const chargeItemId = getLineChargeItemId(item, !claimId);
  const [chargeItemHistory, claimHistory] = await Promise.all([
    chargeItemId ? medplum.readHistory('ChargeItem', chargeItemId) : undefined,
    claimId ? medplum.readHistory('Claim', claimId) : undefined,
  ]);

  const changes: LineChange[] = [];
  let prev: LineSnapshot | undefined;
  for (const entry of oldestFirst(chargeItemHistory)) {
    const version = entry.resource;
    if (!version) {
      changes.push({ time: entry.response?.lastModified, changes: ['Removed from the visit'] });
      continue;
    }
    const next = chargeItemSnapshot(version);
    pushChange(changes, version.meta, describeLineChanges(prev, next));
    prev = next;
  }

  // The claim's versions, from when the line first appears on it. A line from a charge item joins the claim as it is.
  const key = getLineKey(item);
  let claimPrev: LineSnapshot | undefined;
  for (const entry of oldestFirst(claimHistory)) {
    const version = entry.resource;
    const line = version?.item?.find((i) => getLineKey(i) === key);
    if (!version || !line) {
      continue;
    }
    const next = claimItemSnapshot(version, line);
    const described = describeLineChanges(claimPrev, next, (code) =>
      chargeItemId ? 'Added to this claim' : `Added CPT: ${code}`
    );
    pushChange(changes, version.meta, described);
    claimPrev = next;
  }

  // Oldest first, keeping the charge item's changes before the claim's when the times tie, then newest first.
  return changes.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')).reverse();
}

function oldestFirst<T extends ChargeItem | Claim | Condition>(
  bundle: Bundle<T> | undefined
): NonNullable<Bundle<T>['entry']> {
  return [...(bundle?.entry ?? [])].reverse();
}

function pushChange(
  changes: LineChange[],
  meta: { lastUpdated?: string; author?: Reference } | undefined,
  described: string[]
): void {
  if (described.length) {
    changes.push({ time: meta?.lastUpdated, author: meta?.author, changes: described });
  }
}

/**
 * What identifies a line across a claim's versions, as its sequence changes: the charge item it bills, else when it
 * was added, else its sequence.
 * @param item - The line.
 * @returns The key.
 */
function getLineKey(item: ClaimItem): string {
  const ext = (url: string): string | undefined =>
    item.extension?.find((e) => e.url === url)?.valueReference?.reference ??
    item.extension?.find((e) => e.url === url)?.valueDateTime;
  return ext(LINE_CHARGE_ITEM_URL) ?? ext(LINE_ADDED_URL) ?? `sequence-${item.sequence}`;
}

/**
 * The full history of a diagnosis, newest first: each version of its Condition on the visit, then, on a claim, each
 * version of the claim that added, moved or removed it. Versions that didn't change it are left out.
 * @param medplum - The Medplum client.
 * @param code - The diagnosis's ICD-10 code.
 * @param condition - The visit's Condition for it, if any.
 * @param claimId - The claim it's on; none for the visit's own diagnoses.
 * @returns The changes, newest first.
 */
export async function loadDiagnosisHistory(
  medplum: MedplumClient,
  code: string,
  condition: Condition | undefined,
  claimId: string | undefined
): Promise<LineChange[]> {
  const [conditionHistory, claimHistory] = await Promise.all([
    condition?.id ? medplum.readHistory('Condition', condition.id) : undefined,
    claimId ? medplum.readHistory('Claim', claimId) : undefined,
  ]);

  const changes: LineChange[] = [];
  let prev: { code?: string; status?: string } | undefined;
  for (const entry of oldestFirst(conditionHistory)) {
    const version = entry.resource;
    if (!version) {
      continue;
    }
    const next = { code: version.code?.coding?.[0]?.code, status: version.clinicalStatus?.coding?.[0]?.code };
    const described: string[] = [];
    if (!prev) {
      described.push(`Added ICD-10: ${next.code ?? code}`);
    } else {
      if (prev.code !== next.code) {
        described.push(`Changed ICD-10: ${prev.code ?? 'none'} → ${next.code ?? 'none'}`);
      }
      if (prev.status !== next.status) {
        described.push(`Changed status: ${prev.status ?? 'none'} → ${next.status ?? 'none'}`);
      }
    }
    pushChange(changes, version.meta, described);
    prev = next;
  }

  // Where the diagnosis sits on each version of the claim, as its letter.
  let prevLetter: string | undefined;
  let seen = false;
  for (const entry of oldestFirst(claimHistory)) {
    const version = entry.resource;
    if (!version) {
      continue;
    }
    const sorted = [...(version.diagnosis ?? [])].sort((a, b) => a.sequence - b.sequence);
    const index = sorted.findIndex((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code === code);
    const letter = index >= 0 ? String.fromCodePoint(65 + index) : undefined;
    let described: string[] = [];
    if (letter && !prevLetter) {
      described = [!seen && condition ? `Added to this claim as ${letter}` : `Added ICD-10: ${code} as ${letter}`];
    } else if (!letter && prevLetter) {
      described = ['Removed from this claim'];
    } else if (letter && prevLetter && letter !== prevLetter) {
      described = [`Moved: ${prevLetter} → ${letter}`];
    }
    pushChange(changes, version.meta, described);
    seen ||= !!letter;
    prevLetter = letter;
  }

  return changes.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')).reverse();
}

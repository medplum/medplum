// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference, getReferenceString } from '@medplum/core';
import type { ChargeItem, CodeableConcept, Condition, Encounter, Reference, ServiceRequest } from '@medplum/fhirtypes';

/**
 * Standalone function to fetch and apply ChargeItemDefinition to charge item
 * @param medplum - Medplum client instance
 * @param chargeItem - Current charge item
 * @returns Promise with updated charge items
 */
export async function applyChargeItemDefinition(
  medplum: MedplumClient,
  chargeItem: WithId<ChargeItem>
): Promise<WithId<ChargeItem>> {
  if (!chargeItem.definitionCanonical || chargeItem.definitionCanonical.length === 0) {
    return chargeItem;
  }

  const searchResult = await medplum.searchResources(
    'ChargeItemDefinition',
    `url=${chargeItem.definitionCanonical[0]}`
  );

  if (searchResult.length === 0) {
    return chargeItem;
  }

  const chargeItemDefinition = searchResult[0];
  const applyResult = await medplum.post(medplum.fhirUrl('ChargeItemDefinition', chargeItemDefinition.id, '$apply'), {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'chargeItem',
        valueReference: createReference(chargeItem),
      },
    ],
  });

  return applyResult as WithId<ChargeItem>;
}

export async function getChargeItemsForEncounter(
  medplum: MedplumClient,
  encounter: Encounter
): Promise<WithId<ChargeItem>[]> {
  if (!encounter) {
    return [];
  }

  const chargeItems = await medplum.searchResources('ChargeItem', `context=${getReferenceString(encounter)}`);
  const updatedChargeItems = await Promise.all(
    chargeItems.map((chargeItem) => applyChargeItemDefinition(medplum, chargeItem))
  );
  return updatedChargeItems;
}

export function calculateTotalPrice(items: ChargeItem[]): number {
  return items.reduce((sum, item) => sum + (item.priceOverride?.value || 0), 0);
}

/**
 * Mirrors the encounter's diagnoses onto the `reason` of visit-level charge items — the ones
 * not originated by a ServiceRequest (e.g. the E/M visit item created from the PlanDefinition's
 * ServiceBillingCode extension), identified by having no ServiceRequest in `supportingInformation`.
 * Order-originated charge items keep the diagnoses of their own order instead.
 *
 * `reason` is fully replaced (rank order) so removals and reorders propagate; a removed
 * encounter diagnosis also disappears from the claim line's pointers.
 *
 * @param medplum - The Medplum client.
 * @param encounter - The encounter whose charge items are synced.
 * @param conditions - The encounter's diagnosis Conditions in rank order.
 * @returns The charge items that were updated (with their ChargeItemDefinition re-applied).
 */
export async function syncEncounterDiagnosesToVisitChargeItems(
  medplum: MedplumClient,
  encounter: Encounter,
  conditions: Condition[]
): Promise<WithId<ChargeItem>[]> {
  const reasonList = conditions
    .map((condition) => condition.code)
    .filter((code): code is CodeableConcept => !!code?.coding?.length);
  const reason = reasonList.length > 0 ? reasonList : undefined;

  const chargeItems = await medplum.searchResources('ChargeItem', `context=${getReferenceString(encounter)}`);
  const visitChargeItems = chargeItems.filter(
    (item) => !item.supportingInformation?.some((ref) => ref.reference?.startsWith('ServiceRequest/'))
  );

  const updated: WithId<ChargeItem>[] = [];
  for (const chargeItem of visitChargeItems) {
    if (JSON.stringify(chargeItem.reason) === JSON.stringify(reason)) {
      continue;
    }
    const updatedChargeItem = await medplum.updateResource({ ...chargeItem, reason });
    updated.push(await applyChargeItemDefinition(medplum, updatedChargeItem));
  }
  return updated;
}

/**
 * Repoints the encounter ChargeItem created from the draft ServiceRequest (PlanDefinition
 * `$apply`) to the submitted lab order, and copies the order's `reasonCode` onto
 * `ChargeItem.reason` so claim lines can compute diagnosis pointers (CMS-1500 Box 24E).
 * The ChargeItem is created at encounter creation, before diagnoses are chosen, so this
 * is the only moment both sides exist. No-op when no ChargeItem references the draft order.
 *
 * @param medplum - The Medplum client.
 * @param encounter - The encounter the ChargeItem belongs to.
 * @param previousServiceRequestRef - Reference string of the draft ServiceRequest the ChargeItem was created from.
 * @param labOrder - The submitted lab order ServiceRequest.
 * @returns The updated ChargeItem, or undefined when none matched.
 */
export async function relinkChargeItemToLabOrder(
  medplum: MedplumClient,
  encounter: Reference<Encounter>,
  previousServiceRequestRef: string | undefined,
  labOrder: ServiceRequest
): Promise<WithId<ChargeItem> | undefined> {
  if (!previousServiceRequestRef || !labOrder.id) {
    return undefined;
  }
  const chargeItems = await medplum.searchResources('ChargeItem', `context=${encounter.reference}`);
  const chargeItem = chargeItems.find((item) =>
    item.supportingInformation?.some((ref) => ref.reference === previousServiceRequestRef)
  );
  if (!chargeItem) {
    return undefined;
  }
  return medplum.updateResource({
    ...chargeItem,
    supportingInformation: chargeItem.supportingInformation?.map((ref) =>
      ref.reference === previousServiceRequestRef ? { reference: getReferenceString(labOrder) } : ref
    ),
    ...(labOrder.reasonCode?.length ? { reason: labOrder.reasonCode } : {}),
  });
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, PatchOperation, WithId } from '@medplum/core';
import { createReference, getReferenceString } from '@medplum/core';
import type { ChargeItem, Encounter, Reference, ServiceRequest } from '@medplum/fhirtypes';

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
 * Repoints the encounter ChargeItem created from the draft ServiceRequest to the submitted lab
 * order, and replaces its `reason` with the order's `reasonCode` so claim lines can compute their
 * diagnosis pointers. A leftover reason is cleared, since it would produce wrong pointers.
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
  const ops: PatchOperation[] = [
    {
      op: 'add',
      path: '/supportingInformation',
      value: chargeItem.supportingInformation?.map((ref) =>
        ref.reference === previousServiceRequestRef ? { reference: getReferenceString(labOrder) } : ref
      ),
    },
  ];
  if (labOrder.reasonCode?.length) {
    ops.push({ op: 'add', path: '/reason', value: labOrder.reasonCode });
  } else if (chargeItem.reason) {
    ops.push({ op: 'remove', path: '/reason' });
  }
  return medplum.patchResource('ChargeItem', chargeItem.id, ops);
}

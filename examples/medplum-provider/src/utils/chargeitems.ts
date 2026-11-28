// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference, getReferenceString, HTTP_HL7_ORG } from '@medplum/core';
import type { ChargeItem, CodeableConcept, Encounter } from '@medplum/fhirtypes';

export const CHARGE_ITEM_MODIFIER_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition/chargeitem-modifier`;
/** A charge item's place among the visit's service lines. */
export const CHARGE_ITEM_SEQUENCE_URL = 'https://medplum.com/fhir/StructureDefinition/charge-item-sequence';

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
  return sortChargeItems(updatedChargeItems);
}

export function calculateTotalPrice(items: ChargeItem[]): number {
  return items.reduce((sum, item) => sum + (item.priceOverride?.value || 0), 0);
}

/**
 * Orders charge items as the visit lists them: by their saved line position, then as found.
 * @param chargeItems - The charge items.
 * @returns The charge items in order.
 */
export function sortChargeItems<T extends ChargeItem>(chargeItems: T[]): T[] {
  const position = (c: ChargeItem): number =>
    c.extension?.find((e) => e.url === CHARGE_ITEM_SEQUENCE_URL)?.valueInteger ?? Number.MAX_SAFE_INTEGER;
  return chargeItems
    .map((c, i) => ({ c, i }))
    .sort((a, b) => position(a.c) - position(b.c) || a.i - b.i)
    .map(({ c }) => c);
}

/**
 * A charge item's procedure modifiers, one per code.
 * @param chargeItem - The charge item.
 * @returns The modifiers, or undefined when it has none.
 */
export function getChargeItemModifiers(chargeItem: ChargeItem): CodeableConcept[] | undefined {
  const modifiers = (chargeItem.extension ?? [])
    .filter((e) => e.url === CHARGE_ITEM_MODIFIER_URL)
    .flatMap((e) => e.valueCodeableConcept?.coding ?? [])
    .map((coding) => ({ coding: [coding] }));
  return modifiers.length ? modifiers : undefined;
}

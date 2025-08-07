// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString, MedplumClient } from '@medplum/core';
import { ChargeItem, Encounter } from '@medplum/fhirtypes';

export const CPT = 'http://www.ama-assn.org/go/cpt';

/**
 * Standalone function to fetch and apply ChargeItemDefinition to charge item
 * @param medplum - Medplum client instance
 * @param chargeItem - Current charge item
 * @returns Promise with updated charge items
 */
export async function applyChargeItemDefinition(medplum: MedplumClient, chargeItem: ChargeItem): Promise<ChargeItem> {
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
  const applyResult = await medplum.post(
    medplum.fhirUrl('ChargeItemDefinition', chargeItemDefinition.id as string, '$apply'),
    {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'chargeItem',
          valueReference: {
            reference: getReferenceString(chargeItem),
          },
        },
      ],
    }
  );

  return applyResult as ChargeItem;
}

export async function getChargeItemsForEncounter(medplum: MedplumClient, encounter: Encounter): Promise<ChargeItem[]> {
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

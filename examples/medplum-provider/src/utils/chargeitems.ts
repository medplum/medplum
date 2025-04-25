import { Encounter, ChargeItem } from '@medplum/fhirtypes';
import { getReferenceString, MedplumClient } from '@medplum/core';

/**
 * Standalone function to fetch and apply charge item definitions to charge items
 * @param medplum - Medplum client instance
 * @param chargeItems - Current charge items
 * @returns Promise with updated charge items
 */
export async function fetchAndApplyChargeItemDefinitions(
  medplum: MedplumClient,
  chargeItems: ChargeItem[]
): Promise<ChargeItem[]> {
  if (!chargeItems || chargeItems.length === 0) {
    return chargeItems;
  }

  const updatedItems = [...chargeItems];
  let hasUpdates = false;

  for (const [index, chargeItem] of chargeItems.entries()) {
    if (chargeItem.definitionCanonical && chargeItem.definitionCanonical.length > 0) {
      try {
        const searchResult = await medplum.searchResources(
          'ChargeItemDefinition',
          `url=${chargeItem.definitionCanonical[0]}`
        );

        if (searchResult.length > 0) {
          const chargeItemDefinition = searchResult[0];
          try {
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

            if (applyResult) {
              const updatedChargeItem = applyResult as ChargeItem;
              updatedItems[index] = updatedChargeItem;
              hasUpdates = true;
            }
          } catch (err) {
            console.error('Error applying ChargeItemDefinition:', err);
          }
        }
      } catch (err) {
        console.error('Error fetching ChargeItemDefinition:', err);
        throw err;
      }
    }
  }

  return hasUpdates ? updatedItems : chargeItems;
}

export async function getChargeItemsForEncounter(medplum: MedplumClient, encounter: Encounter): Promise<ChargeItem[]> {
  if (!encounter) {
    return [];
  }

  const chargeItems = await medplum.searchResources('ChargeItem', `context=${getReferenceString(encounter)}`);
  const updatedChargeItems = await fetchAndApplyChargeItemDefinitions(medplum, chargeItems);
  return updatedChargeItems;
}

export function calculateTotalPrice(items: ChargeItem[]): number {
  return items.reduce((sum, item) => sum + (item.priceOverride?.value || 0), 0);
}

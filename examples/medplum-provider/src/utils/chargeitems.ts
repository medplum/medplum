import { getReferenceString, MedplumClient } from '@medplum/core';
import { ChargeItem, ClaimItem, Encounter, Reference } from '@medplum/fhirtypes';

export const CPT = 'http://www.ama-assn.org/go/cpt';

export function getCptChargeItems(chargeItems: ChargeItem[], encounter: Reference<Encounter>): ClaimItem[] {
  const cptChargeItems = chargeItems.filter((item) => item.code?.coding?.some((coding) => coding.system === CPT));

  return cptChargeItems.map((chargeItem: ChargeItem, index: number) => {
    const modifiers = chargeItem.extension
      ?.filter((ext) => ext.url === 'http://hl7.org/fhir/StructureDefinition/chargeitem-modifier')
      .map((ext) => {
        return ext.valueCodeableConcept;
      })
      .filter((modifier) => modifier !== undefined);

    return {
      sequence: index + 1,
      encounter: [encounter],
      productOrService: {
        coding: chargeItem.code.coding?.filter((coding) => coding.system === CPT),
        text: chargeItem.code.text,
      },
      net: chargeItem.priceOverride,
      ...(modifiers && modifiers.length > 0 ? { modifier: modifiers } : {}),
    };
  });
}

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

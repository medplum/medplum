import { allOk, evalFhirPathTyped, getReferenceString, toJsBoolean, toTypedValue } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { getAuthenticatedContext } from '../../context';
import { getOperationDefinition } from './definitions';
import { parseInputParameters } from './utils/parameters';
import { ChargeItem, ChargeItemDefinition, Money, Reference } from '@medplum/fhirtypes';

const operation = getOperationDefinition('ChargeItemDefinition', 'apply');

interface ChargeItemDefinitionParameters {
  readonly chargeItem: Reference<ChargeItem>;
}

/**
 * Handles a ChargeItemDefinition $apply operation.
 * This operation applies a ChargeItemDefinition resource to a specific context,
 * often including a patient, encounter, or other relevant resources.
 *
 * See: https://www.hl7.org/fhir/chargeitemdefinition-operation-apply.html
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function chargeItemDefinitionApplyHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;
  const chargeItemDefinition: ChargeItemDefinition = await ctx.repo.readResource<ChargeItemDefinition>('ChargeItemDefinition', id);
  const params = parseInputParameters<ChargeItemDefinitionParameters>(operation, req);
  const inputChargeItemRef = params.chargeItem;
  const inputChargeItem = await ctx.repo.readReference<ChargeItem>(inputChargeItemRef);

  const chargeItemDefinitionReference = getReferenceString(chargeItemDefinition);
  const updatedChargeItem: ChargeItem = {
    ...inputChargeItem,
    definitionCanonical: inputChargeItem.definitionCanonical?.includes(chargeItemDefinitionReference)
      ? inputChargeItem.definitionCanonical
      : [...(inputChargeItem.definitionCanonical || []), chargeItemDefinitionReference],
  };

  if (chargeItemDefinition.propertyGroup) {
    for (const group of chargeItemDefinition.propertyGroup) {
      if (group.priceComponent && group.priceComponent.length > 0) {
        const basePriceComp = group.priceComponent.find((pc) => pc.type === 'base');
        if (basePriceComp?.amount) {
          updatedChargeItem.priceOverride = basePriceComp.amount;
          break;
        }
      }
    }
  }

  if (chargeItemDefinition.propertyGroup) {
    let basePrice: Money | undefined;
    let currency: Money['currency'] | undefined;

    // First pass: Find base price and capture the currency
    for (const group of chargeItemDefinition.propertyGroup) {
      let isGroupApplicable = true;
      if (group.applicability && group.applicability.length > 0) {
        for (const condition of group.applicability) {
          if (condition.expression) {
            const value = toTypedValue(updatedChargeItem);
            const result = evalFhirPathTyped(condition.expression, [value], { '%resource': value });
            isGroupApplicable = toJsBoolean(result);
          }
        }
      }

      if (!isGroupApplicable) {
        continue;
      }

      if (group.priceComponent && group.priceComponent.length > 0) {
        const basePriceComp = group.priceComponent.find((pc) => pc.type === 'base');
        if (basePriceComp?.amount) {
          basePrice = basePriceComp.amount;
          currency = basePriceComp.amount.currency;
          break;
        }
      }
    }

    // Second pass: Apply all modifiers
    if (basePrice?.value !== undefined) {
      let finalPrice = basePrice.value;

      for (const group of chargeItemDefinition.propertyGroup) {
        let isGroupApplicable = true;
        if (group.applicability && group.applicability.length > 0) {
          for (const condition of group.applicability) {
            if (condition.expression) {
              const value = toTypedValue(updatedChargeItem);
              const result = evalFhirPathTyped(condition.expression, [value], { '%resource': value });
              isGroupApplicable = toJsBoolean(result);
            }
          }
        }

        if (!isGroupApplicable) {
          continue;
        }

        if (group.priceComponent) {
          for (const component of group.priceComponent) {
            if (component.type === 'base') {
              continue;
            }

            if (component.type === 'surcharge') {
              if (component.amount?.value) {
                finalPrice += component.amount.value;
              } else if (component.factor) {
                finalPrice += basePrice.value * component.factor;
              }
            }

            if (component.type === 'discount') {
              if (component.amount?.value) {
                finalPrice -= component.amount.value;
              } else if (component.factor) {
                finalPrice -= basePrice.value * component.factor;
              }
            }
          }
        }
      }

      updatedChargeItem.priceOverride = {
        value: finalPrice,
        currency: currency,
      };
    }
  }

  const result = await ctx.repo.updateResource<ChargeItem>(updatedChargeItem);
  return [allOk, result];
}

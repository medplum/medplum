// Search Immediate Representation (IR) module
//
// https://hl7.org/fhir/R4/search.html
//
// FHIR R4 has the following search parameter types:
//  1. Number
//  2. Date/DateTime
//  3. String
//  4. Token
//  5. Reference
//  6. Composite
//  7. Quantity
//  8. URI
//  9. Special
//
// To make matters more complicated, we must consider that these search parameters can be applied
// to many different underlying element types.
//
// To make our lives easier, we will use a simple Immediate Representation (IR) format to represent the search parameters.
// All underlying element types will be mapped to the IR format for the corresponding search parameter type.

import { CodeableConcept, Coding, ContactPoint, Identifier, Period, Quantity } from '@medplum/fhirtypes';
import { isQuantity, toPeriod } from '../fhirpath/utils';
import { typedValueToString } from '../format';
import { isReference, TypedValue } from '../types';
import { isString } from '../utils';

export type NumberSearchIR = number;
export type DateSearchIR = Period;
export type StringSearchIR = string;
export type TokenSearchIR = Coding;
export type ReferenceSearchIR = string;
export type QuantitySearchIR = Quantity;
export type UriSearchIR = string;

export function convertToNumberSearchIR(typedValues: TypedValue[]): NumberSearchIR[] {
  const result: NumberSearchIR[] = [];
  for (const typedValue of typedValues) {
    if (typeof typedValue.value === 'number') {
      result.push(typedValue.value);
    }
  }
  return result;
}

export function convertToDateSearchIR(typedValues: TypedValue[]): DateSearchIR[] {
  const result: DateSearchIR[] = [];
  for (const typedValue of typedValues) {
    const period = toPeriod(typedValue.value);
    if (period) {
      result.push(period);
    }
  }
  return result;
}

export function convertToStringSearchIR(typedValues: TypedValue[]): StringSearchIR[] {
  const result: StringSearchIR[] = [];
  for (const typedValue of typedValues) {
    const str = typedValueToString(typedValue);
    if (str) {
      result.push(str);
    }
  }
  return result;
}

export function convertToTokenSearchIR(typedValues: TypedValue[]): TokenSearchIR[] {
  const result: TokenSearchIR[] = [];
  for (const typedValue of typedValues) {
    switch (typedValue.type) {
      case 'boolean':
        result.push({ code: typedValue.value.toString() });
        break;
      case 'code':
      case 'id':
      case 'string':
      case 'uri':
        result.push({ code: typedValue.value });
        break;
      case 'Coding':
        result.push(typedValue.value as Coding);
        break;
      case 'CodeableConcept':
        {
          const cc = typedValue.value as CodeableConcept;
          if (cc.coding) {
            for (const coding of cc.coding) {
              result.push(coding);
            }
          }
          if (cc.text) {
            result.push({ code: cc.text });
          }
        }
        break;
      case 'ContactPoint':
        {
          const contactPoint = typedValue.value as ContactPoint;
          result.push({
            system: contactPoint.system,
            code: contactPoint.value,
          });
        }
        break;
      case 'Identifier':
        {
          const identifier = typedValue.value as Identifier;
          result.push({
            system: identifier.system,
            code: identifier.value,
          });
        }
        break;
    }
  }
  return result;
}

export function convertToReferenceSearchIR(typedValues: TypedValue[]): ReferenceSearchIR[] {
  const result: ReferenceSearchIR[] = [];
  for (const typedValue of typedValues) {
    if (isString(typedValue.value)) {
      result.push(typedValue.value);
    } else if (isReference(typedValue.value)) {
      result.push(typedValue.value.reference);
    }
  }
  return result;
}

export function convertToQuantitySearchIR(typedValues: TypedValue[]): QuantitySearchIR[] {
  const result: QuantitySearchIR[] = [];
  for (const typedValue of typedValues) {
    if (isQuantity(typedValue.value)) {
      result.push(typedValue.value as Quantity);
    }
  }
  return result;
}

export function convertToUriSearchIR(typedValues: TypedValue[]): UriSearchIR[] {
  const result: StringSearchIR[] = [];
  for (const typedValue of typedValues) {
    if (isString(typedValue.value)) {
      result.push(typedValue.value);
    }
  }
  return result;
}

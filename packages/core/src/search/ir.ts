// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

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
import { isReference, PropertyType, TypedValue } from '../types';
import { getReferenceString, isResourceWithId, isString } from '../utils';

export interface SearchableToken {
  readonly system: string | undefined;
  readonly value: string | undefined;
}

export function convertToSearchableNumbers(typedValues: TypedValue[]): [number | undefined, number | undefined][] {
  const result: [number | undefined, number | undefined][] = [];
  for (const typedValue of typedValues) {
    if (typedValue.type === PropertyType.Range) {
      result.push([typedValue.value?.low?.value, typedValue.value?.high?.value]);
    } else if (typeof typedValue.value === 'number') {
      result.push([typedValue.value, typedValue.value]);
    }
  }
  return result;
}

export function convertToSearchableDates(typedValues: TypedValue[]): Period[] {
  const result: Period[] = [];
  for (const typedValue of typedValues) {
    const period = toPeriod(typedValue.value);
    if (period) {
      result.push(period);
    }
  }
  return result;
}

export function convertToSearchableStrings(typedValues: TypedValue[]): string[] {
  const result: string[] = [];
  for (const typedValue of typedValues) {
    const str = typedValueToString(typedValue);
    if (str) {
      result.push(str);
    }
  }
  return result;
}

export function convertToSearchableReferences(typedValues: TypedValue[]): string[] {
  const result: string[] = [];
  for (const typedValue of typedValues) {
    const { value } = typedValue;
    if (!value) {
      continue;
    }
    if (isString(value)) {
      // Handle "canonical" properties such as QuestionnaireResponse.questionnaire
      // This is a reference string that is not a FHIR reference
      result.push(value);
    } else if (isReference(value)) {
      // Handle normal "reference" properties
      result.push(value.reference);
    } else if (isResourceWithId(value)) {
      // Handle inline references
      result.push(getReferenceString(value));
    } else if (typeof value.identifier === 'object') {
      // Handle logical (identifier-only) references by putting a placeholder in the column
      // NOTE(mattwiller 2023-11-01): This is done to enable searches using the :missing modifier;
      // actual identifier search matching is handled by the `<ResourceType>_Token` lookup tables
      result.push(`identifier:${value.identifier.system}|${value.identifier.value}`);
    }
  }
  return result;
}

export function convertToSearchableQuantities(typedValues: TypedValue[]): Quantity[] {
  const result: Quantity[] = [];
  for (const typedValue of typedValues) {
    const { value } = typedValue;
    if (typeof value === 'number') {
      result.push({ value });
    } else if (isQuantity(value)) {
      result.push(value);
    }
  }
  return result;
}

export function convertToSearchableUris(typedValues: TypedValue[]): string[] {
  const result: string[] = [];
  for (const typedValue of typedValues) {
    if (isString(typedValue.value)) {
      result.push(typedValue.value);
    }
  }
  return result;
}

export interface TokensContext {
  caseInsensitive?: boolean;
  textSearchSystem?: string;
}

export function convertToSearchableTokens(typedValues: TypedValue[], context: TokensContext = {}): SearchableToken[] {
  const result: SearchableToken[] = [];
  for (const typedValue of typedValues) {
    buildTokens(context, result, typedValue);
  }
  return result;
}

/**
 * Builds a list of zero or more tokens for a search parameter and value.
 * @param context - The context for building tokens.
 * @param result - The result array where tokens will be added.
 * @param typedValue - A typed value to be indexed for the search parameter.
 */
function buildTokens(context: TokensContext, result: SearchableToken[], typedValue: TypedValue): void {
  const { type, value } = typedValue;

  switch (type) {
    case PropertyType.Identifier:
      buildIdentifierToken(result, context, value as Identifier);
      break;
    case PropertyType.CodeableConcept:
      buildCodeableConceptToken(result, context, value as CodeableConcept);
      break;
    case PropertyType.Coding:
      buildCodingToken(result, context, value as Coding);
      break;
    case PropertyType.ContactPoint:
      buildContactPointToken(result, context, value as ContactPoint);
      break;
    default:
      buildSimpleToken(result, context, undefined, value?.toString() as string | undefined);
  }
}

/**
 * Builds an identifier token.
 * @param result - The result array where tokens will be added.
 * @param context - Context for building tokens.
 * @param identifier - The Identifier object to be indexed.
 */
function buildIdentifierToken(
  result: SearchableToken[],
  context: TokensContext,
  identifier: Identifier | undefined
): void {
  if (identifier?.type?.text) {
    buildSimpleToken(result, context, context.textSearchSystem, identifier.type.text);
  }
  buildSimpleToken(result, context, identifier?.system, identifier?.value);
}

/**
 * Builds zero or more CodeableConcept tokens.
 * @param result - The result array where tokens will be added.
 * @param context - Context for building tokens.
 * @param codeableConcept - The CodeableConcept object to be indexed.
 */
function buildCodeableConceptToken(
  result: SearchableToken[],
  context: TokensContext,
  codeableConcept: CodeableConcept | undefined
): void {
  if (codeableConcept?.text) {
    buildSimpleToken(result, context, context.textSearchSystem, codeableConcept.text);
  }
  if (codeableConcept?.coding) {
    for (const coding of codeableConcept.coding) {
      buildCodingToken(result, context, coding);
    }
  }
}

/**
 * Builds a Coding token.
 * @param result - The result array where tokens will be added.
 * @param context - Context for building tokens.
 * @param coding - The Coding object to be indexed.
 */
function buildCodingToken(result: SearchableToken[], context: TokensContext, coding: Coding | undefined): void {
  if (coding) {
    if (coding.display) {
      buildSimpleToken(result, context, context.textSearchSystem, coding.display);
    }
    buildSimpleToken(result, context, coding.system, coding.code);
  }
}

/**
 * Builds a ContactPoint token.
 * @param result - The result array where tokens will be added.
 * @param context - Context for building tokens.
 * @param contactPoint - The ContactPoint object to be indexed.
 */
function buildContactPointToken(
  result: SearchableToken[],
  context: TokensContext,
  contactPoint: ContactPoint | undefined
): void {
  if (contactPoint) {
    buildSimpleToken(result, context, contactPoint.system, contactPoint.value?.toLocaleLowerCase());
  }
}

/**
 * Builds a simple token.
 * @param result - The result array where tokens will be added.
 * @param context - Context for building tokens.
 * @param system - The token system.
 * @param value - The token value.
 */
function buildSimpleToken(
  result: SearchableToken[],
  context: TokensContext,
  system: string | undefined,
  value: string | undefined
): void {
  // Only add the token if there is a system or a value, and if it is not already in the list.
  if ((system || value) && !result.some((token) => token.system === system && token.value === value)) {
    result.push({
      system,
      value: value && context.caseInsensitive ? value.toLocaleLowerCase() : value,
    });
  }
}

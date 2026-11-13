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

import type { CodeableConcept, Coding, ContactPoint, Identifier, Period, Quantity } from '@medplum/fhirtypes';
import { isQuantity, toPeriod } from '../fhirpath/utils';
import { typedValueToString } from '../format';
import type { TypedValue } from '../types';
import { isReference, PropertyType } from '../types';
import { EMPTY, getReferenceString, isResourceWithId, isString } from '../utils';

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
  const result = new Set<string>();
  for (const typedValue of typedValues) {
    const str = typedValueToString(typedValue);
    if (str) {
      result.add(str);
    }
  }
  return Array.from(result);
}

export function convertToSearchableReferences(typedValues: TypedValue[]): string[] {
  const result = new Set<string>();
  for (const typedValue of typedValues) {
    const { value } = typedValue;
    if (!value) {
      continue;
    }
    if (isString(value)) {
      // Handle "canonical" properties such as QuestionnaireResponse.questionnaire
      // This is a reference string that is not a FHIR reference
      result.add(value);
    } else if (isReference(value)) {
      // Handle normal "reference" properties
      result.add(value.reference);
    } else if (isResourceWithId(value)) {
      // Handle inline references
      result.add(getReferenceString(value));
    } else if (typeof value.identifier === 'object') {
      // Handle logical (identifier-only) references by putting a placeholder in the column
      // NOTE(mattwiller 2023-11-01): This is done to enable searches using the :missing modifier;
      // actual identifier search matching is handled by the `<ResourceType>_Token` lookup tables
      result.add(`identifier:${value.identifier.system}|${value.identifier.value}`);
    }
  }
  return Array.from(result);
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
  const result = new Set<string>();
  for (const typedValue of typedValues) {
    if (isString(typedValue.value)) {
      result.add(typedValue.value);
    }
  }
  return Array.from(result);
}

export interface TokensContext {
  caseInsensitive?: boolean;
  textSearchSystem?: string;
}

export function convertToSearchableTokens(typedValues: TypedValue[], context: TokensContext = {}): SearchableToken[] {
  const tokens = new SearchableTokenSet(context);
  for (const typedValue of typedValues) {
    buildTokens(tokens, typedValue);
  }
  return tokens.result;
}

/**
 * Accumulates unique tokens in insertion order.
 * Uniqueness is tracked by hash lookup so that resources with many tokens (e.g. large ValueSets) stay linear.
 */
class SearchableTokenSet {
  readonly context: TokensContext;
  readonly result: SearchableToken[] = [];
  private readonly seen = new Map<string | undefined, Set<string | undefined>>();

  constructor(context: TokensContext) {
    this.context = context;
  }

  /**
   * Adds a token if there is a system or a value, and if it is not already in the set.
   * @param system - The token system.
   * @param value - The token value.
   */
  add(system: string | undefined, value: string | undefined): void {
    if (!system && !value) {
      return;
    }
    const normalizedValue = value && this.context.caseInsensitive ? value.toLocaleLowerCase() : value;
    let values = this.seen.get(system);
    if (!values) {
      values = new Set();
      this.seen.set(system, values);
    }
    if (!values.has(normalizedValue)) {
      values.add(normalizedValue);
      this.result.push({ system, value: normalizedValue });
    }
  }
}

/**
 * Builds a list of zero or more tokens for a search parameter and value.
 * @param tokens - The token set where tokens will be added.
 * @param typedValue - A typed value to be indexed for the search parameter.
 */
function buildTokens(tokens: SearchableTokenSet, typedValue: TypedValue): void {
  const { type, value } = typedValue;

  switch (type) {
    case PropertyType.Identifier:
      buildIdentifierToken(tokens, value as Identifier);
      break;
    case PropertyType.CodeableConcept:
      buildCodeableConceptToken(tokens, value as CodeableConcept);
      break;
    case PropertyType.Coding:
      buildCodingToken(tokens, value as Coding);
      break;
    case PropertyType.ContactPoint:
      buildContactPointToken(tokens, value as ContactPoint);
      break;
    default:
      tokens.add(undefined, value?.toString() as string | undefined);
  }
}

/**
 * Builds an identifier token.
 * @param tokens - The token set where tokens will be added.
 * @param identifier - The Identifier object to be indexed.
 */
function buildIdentifierToken(tokens: SearchableTokenSet, identifier: Identifier | undefined): void {
  if (identifier?.type?.text) {
    tokens.add(tokens.context.textSearchSystem, identifier.type.text);
  }
  tokens.add(identifier?.system, identifier?.value);
}

/**
 * Builds zero or more CodeableConcept tokens.
 * @param tokens - The token set where tokens will be added.
 * @param codeableConcept - The CodeableConcept object to be indexed.
 */
function buildCodeableConceptToken(tokens: SearchableTokenSet, codeableConcept: CodeableConcept | undefined): void {
  if (codeableConcept?.text) {
    tokens.add(tokens.context.textSearchSystem, codeableConcept.text);
  }
  for (const coding of codeableConcept?.coding ?? EMPTY) {
    buildCodingToken(tokens, coding);
  }
}

/**
 * Builds a Coding token.
 * @param tokens - The token set where tokens will be added.
 * @param coding - The Coding object to be indexed.
 */
function buildCodingToken(tokens: SearchableTokenSet, coding: Coding | undefined): void {
  if (coding) {
    if (coding.display) {
      tokens.add(tokens.context.textSearchSystem, coding.display);
    }
    tokens.add(coding.system, coding.code);
  }
}

/**
 * Builds a ContactPoint token.
 * @param tokens - The token set where tokens will be added.
 * @param contactPoint - The ContactPoint object to be indexed.
 */
function buildContactPointToken(tokens: SearchableTokenSet, contactPoint: ContactPoint | undefined): void {
  if (contactPoint) {
    tokens.add(contactPoint.system, contactPoint.value);
  }
}

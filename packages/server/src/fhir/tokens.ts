// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  badRequest,
  convertToSearchableTokens,
  evalFhirPathTyped,
  getSearchParameterDetails,
  OperationOutcomeError,
  Operator,
  PropertyType,
  TokensContext,
  toTypedValue,
} from '@medplum/core';
import { Resource, SearchParameter } from '@medplum/fhirtypes';

export interface Token {
  readonly code: string;
  readonly system: string | undefined;
  readonly value: string | undefined;
}

export const TokenIndexTypes = {
  CASE_SENSITIVE: 'CASE_SENSITIVE',
  CASE_INSENSITIVE: 'CASE_INSENSITIVE',
} as const;

export type TokenIndexType = (typeof TokenIndexTypes)[keyof typeof TokenIndexTypes];

/**
 * Returns A `TokenIndexTypes` value if the search parameter is of a type including both a system and value, undefined otherwise.
 * @param searchParam - The search parameter.
 * @param resourceType - The resource type.
 * @returns A `TokenIndexTypes` value if the search parameter is of a type including both a system and value, undefined otherwise.
 */
export function getTokenIndexType(searchParam: SearchParameter, resourceType: string): TokenIndexType | undefined {
  if (searchParam.type !== 'token') {
    return undefined;
  }

  if (searchParam.code?.endsWith(':identifier')) {
    return TokenIndexTypes.CASE_SENSITIVE;
  }

  const details = getSearchParameterDetails(resourceType, searchParam);

  if (!details.elementDefinitions?.length) {
    return undefined;
  }

  // Check for any "ContactPoint", "Identifier", "CodeableConcept", "Coding"
  // Any of those value types require the "Token" table for full system|value search semantics.
  // The common case is that the "type" property only has one value,
  // but we need to support arrays of types for the choice-of-type properties such as "value[x]".

  // Check for case-insensitive types first, as they are more specific than case-sensitive types
  for (const elementDefinition of details.elementDefinitions) {
    for (const type of elementDefinition.type ?? []) {
      if (type.code === PropertyType.ContactPoint) {
        return TokenIndexTypes.CASE_INSENSITIVE;
      }
    }
  }

  // In practice, search parameters covering an element definition with type  "ContactPoint"
  // are mutually exclusive from those covering "Identifier", "CodeableConcept", or "Coding" types,
  // but could technically be possible. A second set of nested for-loops with an early return should
  // be more efficient in the common case than always exhaustively looping through every
  // detail.elementDefinitions.type to see if "ContactPoint" is still to come.
  for (const elementDefinition of details.elementDefinitions) {
    for (const type of elementDefinition.type ?? []) {
      if (
        type.code === PropertyType.Identifier ||
        type.code === PropertyType.CodeableConcept ||
        type.code === PropertyType.Coding
      ) {
        return TokenIndexTypes.CASE_SENSITIVE;
      }
    }
  }

  // This is a "token" search parameter, but it is only "code", "string", or "boolean"
  // So we can use a simple column on the resource type table.
  return undefined;
}

/**
 * Builds a list of zero or more tokens for a search parameter and resource.
 * @param result - The result array where tokens will be added.
 * @param resource - The resource.
 * @param searchParam - The search parameter.
 * @param textSearchSystem - (optional) The system to use for :text-searchable tokens. Defaults to 'text'.
 */
export function buildTokensForSearchParameter(
  result: Token[],
  resource: Resource,
  searchParam: SearchParameter,
  textSearchSystem: string = 'text'
): void {
  const details = getSearchParameterDetails(resource.resourceType, searchParam);
  const typedValues = evalFhirPathTyped(details.parsedExpression, [toTypedValue(resource)]);

  const context: TokensContext = {
    caseInsensitive: getTokenIndexType(searchParam, resource.resourceType) === TokenIndexTypes.CASE_INSENSITIVE,
    textSearchSystem,
  };

  const tokens = convertToSearchableTokens(typedValues, context);
  for (const token of tokens) {
    result.push({
      code: searchParam.code,
      system: token.system,
      value: context.caseInsensitive ? token.value?.toLocaleLowerCase() : token.value,
    });
  }
}

/**
 * Returns true if the filter requires a token to exist based on the provided :missing or :present filter
 * @param operator - Either Operator.MISSING or Operator.PRESENT
 * @param value - Filter value
 * @returns true if the filter requires a token to exist based on the provided :missing or :present filter
 */
export function shouldTokenExistForMissingOrPresent(
  operator: (typeof Operator)['MISSING' | 'PRESENT'],
  value: string
): boolean {
  if (operator === Operator.MISSING) {
    // Missing = true means that there should not be a row
    switch (value.toLowerCase()) {
      case 'true':
        return false;
      case 'false':
        return true;
      default:
        throw new OperationOutcomeError(badRequest("Search filter ':missing' must have a value of 'true' or 'false'"));
    }
  } else if (operator === Operator.PRESENT) {
    // Present = true means that there should be a row
    switch (value.toLowerCase()) {
      case 'true':
        return true;
      case 'false':
        return false;
      default:
        throw new OperationOutcomeError(badRequest("Search filter ':present' must have a value of 'true' or 'false'"));
    }
  }
  return true;
}

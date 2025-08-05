// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Period, Resource } from '@medplum/fhirtypes';
import { evalFhirPathTyped } from '../fhirpath/parse';
import { toPeriod, toTypedValue } from '../fhirpath/utils';
import { TypedValue, globalSchema } from '../types';
import {
  SearchableToken,
  convertToSearchableDates,
  convertToSearchableReferences,
  convertToSearchableStrings,
  convertToSearchableTokens,
} from './ir';
import { Filter, Operator, SearchRequest, splitSearchOnComma } from './search';

/**
 * Determines if the resource matches the search request.
 * @param resource - The resource that was created or updated.
 * @param searchRequest - The subscription criteria as a search request.
 * @returns True if the resource satisfies the search request.
 */
export function matchesSearchRequest(resource: Resource, searchRequest: SearchRequest): boolean {
  if (searchRequest.resourceType !== resource.resourceType) {
    return false;
  }
  if (searchRequest.filters) {
    for (const filter of searchRequest.filters) {
      if (!matchesSearchFilter(resource, searchRequest, filter)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Determines if the resource matches the search filter.
 * @param resource - The resource that was created or updated.
 * @param searchRequest - The search request.
 * @param filter - One of the filters of a subscription criteria.
 * @returns True if the resource satisfies the search filter.
 */
function matchesSearchFilter(resource: Resource, searchRequest: SearchRequest, filter: Filter): boolean {
  const searchParam = globalSchema.types[searchRequest.resourceType]?.searchParams?.[filter.code];
  if (!searchParam) {
    return false;
  }
  const typedValues = evalFhirPathTyped(searchParam.expression as string, [toTypedValue(resource)]);
  if (filter.operator === Operator.MISSING || filter.operator === Operator.PRESENT) {
    return matchesMissingOrPresent(typedValues, filter);
  }
  switch (searchParam.type) {
    case 'reference':
      return matchesReferenceFilter(typedValues, filter);
    case 'string':
    case 'uri':
      return matchesStringFilter(typedValues, filter);
    case 'token':
      return matchesTokenFilter(typedValues, filter);
    case 'date':
      return matchesDateFilter(typedValues, filter);
    default:
      // Unknown search parameter or search parameter type
      // Default fail the check
      return false;
  }
}

function matchesMissingOrPresent(typedValues: TypedValue[], filter: Filter): boolean {
  const exists = typedValues.length > 0;
  const desired =
    (filter.operator === Operator.MISSING && filter.value === 'false') ||
    (filter.operator === Operator.PRESENT && filter.value === 'true');
  return desired === exists;
}

function matchesReferenceFilter(typedValues: TypedValue[], filter: Filter): boolean {
  const negated = isNegated(filter.operator);

  if (filter.value === '' && typedValues.length === 0) {
    // If the filter operator is "equals", then the filter matches.
    // If the filter operator is "not equals", then the filter does not match.
    return filter.operator === Operator.EQUALS;
  }

  // Normalize the values array into reference strings
  const references = convertToSearchableReferences(typedValues);

  for (const filterValue of splitSearchOnComma(filter.value)) {
    let match = references.includes(filterValue);
    if (!match && filter.code === '_compartment') {
      // Backwards compability for compartment search parameter
      // In previous versions, the resource type was not required in compartment values
      // So, "123" would match "Patient/123"
      // We need to maintain this behavior for backwards compatibility
      match = references.some((reference) => reference?.endsWith('/' + filterValue));
    }
    if (match) {
      return !negated;
    }
  }
  // If "not equals" and no matches, then return true
  // If "equals" and no matches, then return false
  return negated;
}

function matchesTokenFilter(typedValues: TypedValue[], filter: Filter): boolean {
  const resourceValues = convertToSearchableTokens(typedValues);
  const filterValues = splitSearchOnComma(filter.value);
  const negated = isNegated(filter.operator);
  for (const resourceValue of resourceValues) {
    for (const filterValue of filterValues) {
      const match = matchesTokenValue(resourceValue, filterValue);
      if (match) {
        return !negated;
      }
    }
  }
  // If "not equals" and no matches, then return true
  // If "equals" and no matches, then return false
  return negated;
}

function matchesTokenValue(resourceValue: SearchableToken, filterValue: string): boolean {
  if (filterValue.includes('|')) {
    const [system, value] = filterValue.split('|').map((s) => s.toLowerCase());
    if (!system && !value) {
      return false;
    } else if (!system) {
      // [parameter]=|[code]: the value of [code] matches a Coding.code or Identifier.value, and the Coding/Identifier has no system property
      return !resourceValue.system && resourceValue.value?.toLowerCase() === value;
    }

    // [parameter]=[system]|: any element where the value of [system] matches the system property of the Identifier or Coding
    // [parameter]=[system]|[code]: the value of [code] matches a Coding.code or Identifier.value, and the value of [system] matches the system property of the Identifier or Coding
    return resourceValue.system?.toLowerCase() === system && (!value || resourceValue.value?.toLowerCase() === value);
  }

  // [parameter]=[code]: the value of [code] matches a Coding.code or Identifier.value irrespective of the value of the system property
  return resourceValue.value?.toLowerCase() === filterValue.toLowerCase();
}

function matchesStringFilter(typedValues: TypedValue[], filter: Filter): boolean {
  const resourceValues = convertToSearchableStrings(typedValues);
  const filterValues = splitSearchOnComma(filter.value);
  const negated = isNegated(filter.operator);
  for (const resourceValue of resourceValues) {
    for (const filterValue of filterValues) {
      const match = matchesStringValue(resourceValue, filterValue);
      if (match) {
        return !negated;
      }
    }
  }
  // If "not equals" and no matches, then return true
  // If "equals" and no matches, then return false
  return negated;
}

function matchesStringValue(resourceValue: string, filterValue: string): boolean {
  return resourceValue.toLowerCase().includes(filterValue.toLowerCase());
}

function matchesDateFilter(typedValues: TypedValue[], filter: Filter): boolean {
  const resourceValues = convertToSearchableDates(typedValues);
  const filterValues = splitSearchOnComma(filter.value);
  const negated = isNegated(filter.operator);
  for (const resourceValue of resourceValues) {
    for (const filterValue of filterValues) {
      const match = matchesDateValue(resourceValue, filter.operator, filterValue);
      if (match) {
        return !negated;
      }
    }
  }
  // If "not equals" and no matches, then return true
  // If "equals" and no matches, then return false
  return negated;
}

function matchesDateValue(resourceValue: Period, operator: Operator, filterValue: string): boolean {
  if (!resourceValue) {
    return false;
  }
  const filterPeriod = toPeriod(filterValue);
  if (!filterPeriod) {
    return false;
  }

  const resourceStart = resourceValue.start ?? '0000';
  const resourceEnd = resourceValue.end ?? '9999';
  const filterStart = filterPeriod.start as string;
  const filterEnd = filterPeriod.end as string;

  switch (operator) {
    case Operator.APPROXIMATELY:
    case Operator.EQUALS:
    case Operator.NOT_EQUALS: // Negation handled in the caller
      return resourceStart < filterEnd && resourceEnd > filterStart;
    case Operator.LESS_THAN:
      return resourceStart < filterStart;
    case Operator.GREATER_THAN:
      return resourceEnd > filterEnd;
    case Operator.LESS_THAN_OR_EQUALS:
      return resourceStart <= filterEnd;
    case Operator.GREATER_THAN_OR_EQUALS:
      return resourceEnd >= filterStart;
    case Operator.STARTS_AFTER:
      return resourceStart > filterEnd;
    case Operator.ENDS_BEFORE:
      return resourceEnd < filterStart;
    default:
      return false;
  }
}

function isNegated(operator: Operator): boolean {
  return operator === Operator.NOT_EQUALS || operator === Operator.NOT;
}

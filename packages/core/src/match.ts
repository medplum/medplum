import { Reference, Resource, SearchParameter } from '@medplum/fhirtypes';
import { evalFhirPath } from './fhirpath';
import { Filter, Operator, SearchRequest } from './search';
import { getSearchParameterDetails, SearchParameterType } from './searchparams';
import { globalSchema } from './types';

/**
 * Determines if the resource matches the search request.
 * @param resource The resource that was created or updated.
 * @param searchRequest The subscription criteria as a search request.
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
 * @param resource The resource that was created or updated.
 * @param filter One of the filters of a subscription criteria.
 * @returns True if the resource satisfies the search filter.
 */
function matchesSearchFilter(resource: Resource, searchRequest: SearchRequest, filter: Filter): boolean {
  const searchParam = globalSchema.types[searchRequest.resourceType]?.searchParams?.[filter.code];
  switch (searchParam?.type) {
    case 'reference':
      return matchesReferenceFilter(resource, filter, searchParam);
    case 'string':
      return matchesStringFilter(resource, filter, searchParam);
    case 'token':
      return matchesTokenFilter(resource, filter, searchParam);
    case 'date':
      return matchesDateFilter(resource, filter, searchParam);
  }
  // Unknown search parameter or search parameter type
  // Default fail the check
  return false;
}

function matchesReferenceFilter(resource: Resource, filter: Filter, searchParam: SearchParameter): boolean {
  const values = evalFhirPath(searchParam.expression as string, resource) as (Reference | string)[];

  if (filter.value === '' && values.length === 0) {
    // If the filter operator is "equals", then the filter matches.
    // If the filter operator is "not equals", then the filter does not match.
    return filter.operator === Operator.EQUALS;
  }

  // Normalize the values array into reference strings
  const references = values.map((value) => (typeof value === 'string' ? value : value.reference));

  for (const filterValue of filter.value.split(',')) {
    const found = references.includes(filterValue);
    if (filter.operator === Operator.NOT_EQUALS ? !found : found) {
      return true;
    }
  }
  return false;
}

function matchesTokenFilter(resource: Resource, filter: Filter, searchParam: SearchParameter): boolean {
  const details = getSearchParameterDetails(resource.resourceType, searchParam);
  if (details.type === SearchParameterType.BOOLEAN) {
    return matchesBooleanFilter(resource, filter, searchParam);
  } else {
    return matchesStringFilter(resource, filter, searchParam);
  }
}

function matchesBooleanFilter(resource: Resource, filter: Filter, searchParam: SearchParameter): boolean {
  const values = evalFhirPath(searchParam.expression as string, resource);
  const expected = filter.value === 'true';
  const result = values.includes(expected);
  return filter.operator === Operator.NOT_EQUALS ? !result : result;
}

function matchesStringFilter(resource: Resource, filter: Filter, searchParam: SearchParameter): boolean {
  const resourceValues = evalFhirPath(searchParam.expression as string, resource);
  const filterValues = filter.value.split(',');
  for (const resourceValue of resourceValues) {
    for (const filterValue of filterValues) {
      if (matchesStringValue(resourceValue, filter.operator, filterValue)) {
        return true;
      }
    }
  }
  return false;
}

function matchesStringValue(resourceValue: unknown, operator: Operator, filterValue: string): boolean {
  let str = '';
  if (resourceValue) {
    if (typeof resourceValue === 'string') {
      str = resourceValue;
    } else if (typeof resourceValue === 'object') {
      str = JSON.stringify(resourceValue);
    }
  }

  const isMatch = str.toLowerCase().includes(filterValue.toLowerCase());
  return operator === Operator.NOT_EQUALS ? !isMatch : isMatch;
}

function matchesDateFilter(resource: Resource, filter: Filter, searchParam: SearchParameter): boolean {
  const resourceValues = evalFhirPath(searchParam.expression as string, resource);
  const filterValues = filter.value.split(',');
  for (const resourceValue of resourceValues) {
    for (const filterValue of filterValues) {
      if (matchesDateValue(resourceValue as string, filter.operator, filterValue)) {
        return true;
      }
    }
  }
  return false;
}

function matchesDateValue(resourceValue: string, operator: Operator, filterValue: string): boolean {
  switch (operator) {
    case Operator.STARTS_AFTER:
    case Operator.GREATER_THAN:
      return resourceValue > filterValue;
    case Operator.GREATER_THAN_OR_EQUALS:
      return resourceValue >= filterValue;
    case Operator.ENDS_BEFORE:
    case Operator.LESS_THAN:
      return resourceValue < filterValue;
    case Operator.LESS_THAN_OR_EQUALS:
      return resourceValue <= filterValue;
    case Operator.EQUALS:
      return resourceValue === filterValue;
    case Operator.NOT_EQUALS:
      return resourceValue !== filterValue;
  }
  return false;
}

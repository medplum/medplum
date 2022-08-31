import {
  evalFhirPath,
  Filter,
  getSearchParameterDetails,
  Operator,
  SearchParameterType,
  SearchRequest,
} from '@medplum/core';
import { Reference, Resource, SearchParameter } from '@medplum/fhirtypes';
import { getSearchParameter } from '../structure';

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
  const searchParam = getSearchParameter(searchRequest.resourceType, filter.code);
  switch (searchParam?.type) {
    case 'reference':
      return matchesReferenceFilter(resource, filter, searchParam);
    case 'string':
      return matchesStringFilter(resource, filter, searchParam);
    case 'token':
      return matchesTokenFilter(resource, filter, searchParam);
  }
  // Unknown search parameter or search parameter type
  // Default fail the check
  return false;
}

function matchesBooleanFilter(resource: Resource, filter: Filter, searchParam: SearchParameter): boolean {
  const values = evalFhirPath(searchParam.expression as string, resource);
  const expected = filter.value === 'true';
  const result = values.includes(expected);
  return filter.operator === Operator.NOT_EQUALS ? !result : result;
}

function matchesReferenceFilter(resource: Resource, filter: Filter, searchParam: SearchParameter): boolean {
  const values = evalFhirPath(searchParam.expression as string, resource).map((value) => {
    if (value) {
      if (typeof value === 'string') {
        // Handle "canonical" properties such as QuestionnaireResponse.questionnaire
        // This is a reference string that is not a FHIR reference
        return value;
      }
      if (typeof value === 'object') {
        // Handle normal "reference" properties
        return (value as Reference).reference;
      }
    }
    return undefined;
  });
  const result = values.includes(filter.value);
  return filter.operator === Operator.NOT_EQUALS ? !result : result;
}

function matchesStringFilter(resource: Resource, filter: Filter, searchParam: SearchParameter): boolean {
  const values = evalFhirPath(searchParam.expression as string, resource);
  const result = values.some((value) => JSON.stringify(value).includes(filter.value));
  return filter.operator === Operator.NOT_EQUALS ? !result : result;
}

function matchesTokenFilter(resource: Resource, filter: Filter, searchParam: SearchParameter): boolean {
  const details = getSearchParameterDetails(resource.resourceType, searchParam);
  if (details.type === SearchParameterType.BOOLEAN) {
    return matchesBooleanFilter(resource, filter, searchParam);
  } else {
    return matchesStringFilter(resource, filter, searchParam);
  }
}

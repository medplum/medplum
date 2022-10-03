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
  if (!searchParam) {
    // Throw error?
    return false;
  }
  for (const filterValue of filter.value.split(',')) {
    if (matchesSearchFilterValue(resource, filter, filterValue)) {
      return true;
    }
  }
  return false;
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
      return true;
  }
  // Unknown search parameter or search parameter type
  // Default fail the check
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
  // const result = values.some((value) => JSON.stringify(value).includes(filter.value));
  // return filter.operator === Operator.NOT_EQUALS ? !result : result;

  // const expression = filter.code.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  // const values = evalFhirPath(expression as string, resource);
  const filterValue = filter.value;

  switch (filter.operator) {
    case Operator.GREATER_THAN:
      return values.some((value) => (value as any).toString() > filterValue);

    case Operator.GREATER_THAN_OR_EQUALS:
      return values.some((value) => (value as any).toString() >= filterValue);

    case Operator.LESS_THAN:
      return values.some((value) => (value as any).toString() < filterValue);

    case Operator.LESS_THAN_OR_EQUALS:
      return values.some((value) => (value as any).toString() <= filterValue);

    default: {
      const result =
        filterValue === '' ||
        values.some((value) => JSON.stringify(value).toLowerCase().includes(filterValue.toLowerCase()));
      return filter.operator === Operator.NOT_EQUALS ? !result : result;
    }
  }
}

/////

// function matchesSearchFilterValue(resource: Resource, filter: Filter, filterValue: string): boolean {
//   const expression = filter.code.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
//   const values = evalFhirPath(expression as string, resource);

//   switch (filter.operator) {
//     case Operator.GREATER_THAN:
//       return values.some((value) => (value as any).toString() > filterValue);

//     case Operator.GREATER_THAN_OR_EQUALS:
//       return values.some((value) => (value as any).toString() >= filterValue);

//     case Operator.LESS_THAN:
//       return values.some((value) => (value as any).toString() < filterValue);

//     case Operator.LESS_THAN_OR_EQUALS:
//       return values.some((value) => (value as any).toString() <= filterValue);

//     default: {
//       const result =
//         filterValue === '' ||
//         values.some((value) => JSON.stringify(value).toLowerCase().includes(filterValue.toLowerCase()));
//       return filter.operator === Operator.NOT_EQUALS ? !result : result;
//     }
//   }
// }

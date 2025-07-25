import { CodeableConcept, Identifier, Reference, Resource, SearchParameter } from '@medplum/fhirtypes';
import { evalFhirPath } from '../fhirpath/parse';
import { isPeriod } from '../fhirpath/utils';
import { PropertyType, globalSchema } from '../types';
import { isString } from '../utils';
import { SearchParameterType, getSearchParameterDetails } from './details';
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
  if (filter.operator === Operator.MISSING || filter.operator === Operator.PRESENT) {
    return matchesMissingOrPresent(resource, filter, searchParam);
  }
  switch (searchParam.type) {
    case 'reference':
      return matchesReferenceFilter(resource, filter, searchParam);
    case 'string':
    case 'uri':
      return matchesStringFilter(resource, filter, searchParam);
    case 'token':
      return matchesTokenFilter(resource, filter, searchParam);
    case 'date':
      return matchesDateFilter(resource, filter, searchParam);
    default:
      // Unknown search parameter or search parameter type
      // Default fail the check
      return false;
  }
}

function matchesMissingOrPresent(resource: Resource, filter: Filter, searchParam: SearchParameter): boolean {
  const values = evalFhirPath(searchParam.expression as string, resource);
  const exists = values.length > 0;
  const desired =
    (filter.operator === Operator.MISSING && filter.value === 'false') ||
    (filter.operator === Operator.PRESENT && filter.value === 'true');
  return desired === exists;
}

function matchesReferenceFilter(resource: Resource, filter: Filter, searchParam: SearchParameter): boolean {
  const values = evalFhirPath(searchParam.expression as string, resource) as (Reference | string)[];
  const negated = isNegated(filter.operator);

  if (filter.value === '' && values.length === 0) {
    // If the filter operator is "equals", then the filter matches.
    // If the filter operator is "not equals", then the filter does not match.
    return filter.operator === Operator.EQUALS;
  }

  // Normalize the values array into reference strings
  const references = values.map((value) => (typeof value === 'string' ? value : value.reference));

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

function matchesTokenFilter(resource: Resource, filter: Filter, searchParam: SearchParameter): boolean {
  const details = getSearchParameterDetails(resource.resourceType, searchParam);
  if (details.type === SearchParameterType.BOOLEAN) {
    return matchesBooleanFilter(resource, filter, searchParam);
  } else {
    return matchesStringFilter(resource, filter, searchParam, true);
  }
}

function matchesBooleanFilter(resource: Resource, filter: Filter, searchParam: SearchParameter): boolean {
  const values = evalFhirPath(searchParam.expression as string, resource);
  const expected = filter.value === 'true';
  const result = values.includes(expected);
  return isNegated(filter.operator) ? !result : result;
}

function matchesStringFilter(
  resource: Resource,
  filter: Filter,
  searchParam: SearchParameter,
  asToken?: boolean
): boolean {
  const details = getSearchParameterDetails(resource.resourceType, searchParam);
  const searchParamElementType = details.elementDefinitions?.[0]?.type?.[0]?.code;
  const resourceValues = evalFhirPath(searchParam.expression as string, resource);
  const filterValues = splitSearchOnComma(filter.value);
  const negated = isNegated(filter.operator);
  for (const resourceValue of resourceValues) {
    for (const filterValue of filterValues) {
      let match;
      if (searchParamElementType === PropertyType.Identifier) {
        match = matchesTokenIdentifierValue(resourceValue as Identifier, filter.operator, filterValue);
      } else if (searchParamElementType === PropertyType.CodeableConcept) {
        match = matchesTokenCodeableConceptValue(resourceValue as CodeableConcept, filter.operator, filterValue);
      } else if (searchParamElementType === PropertyType.Coding) {
        match = matchesTokenCodeableConceptValue(
          { coding: [resourceValue] } as CodeableConcept,
          filter.operator,
          filterValue
        );
      } else {
        match = matchesStringValue(resourceValue, filter.operator, filterValue, asToken);
      }
      if (match) {
        return !negated;
      }
    }
  }
  // If "not equals" and no matches, then return true
  // If "equals" and no matches, then return false
  return negated;
}

function matchesStringValue(
  resourceValue: unknown,
  operator: Operator,
  filterValue: string,
  asToken?: boolean
): boolean {
  if (asToken && filterValue.includes('|')) {
    const [system, code] = filterValue.split('|');
    return (
      matchesStringValue(resourceValue, operator, system, false) &&
      (!code || matchesStringValue(resourceValue, operator, code, false))
    );
  }
  let str = '';
  if (resourceValue) {
    if (typeof resourceValue === 'string') {
      str = resourceValue;
    } else if (typeof resourceValue === 'object') {
      str = JSON.stringify(resourceValue);
    }
  }
  return str.toLowerCase().includes(filterValue.toLowerCase());
}

function matchesTokenIdentifierValue(resourceValue: Identifier, operator: Operator, filterValue: string): boolean {
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

function matchesTokenCodeableConceptValue(
  resourceValue: CodeableConcept,
  _operator: Operator,
  filterValue: string
): boolean {
  if (filterValue.includes('|')) {
    const [system, code] = filterValue.split('|').map((s) => s.toLowerCase());
    if (!system && !code) {
      return false;
    } else if (!system) {
      // [parameter]=|[code]: the value of [code] matches a Coding.code or Identifier.value, and the Coding/Identifier has no system property
      return resourceValue.coding?.some((coding) => !coding.system && coding.code?.toLowerCase() === code) ?? false;
    }

    // [parameter]=[system]|: any element where the value of [system] matches the system property of the Identifier or Coding
    // [parameter]=[system]|[code]: the value of [code] matches a Coding.code or Identifier.value, and the value of [system] matches the system property of the Identifier or Coding
    return (
      resourceValue.coding?.some(
        (coding) => coding.system?.toLowerCase() === system && (!code || coding.code?.toLowerCase() === code)
      ) ?? false
    );
  }

  // [parameter]=[code]: the value of [code] matches a Coding.code or Identifier.value irrespective of the value of the system property
  return (
    resourceValue.text?.toLowerCase() === filterValue.toLowerCase() ||
    (resourceValue.coding?.some((coding) => coding.code?.toLowerCase() === filterValue.toLowerCase()) ?? false)
  );
}

function matchesDateFilter(resource: Resource, filter: Filter, searchParam: SearchParameter): boolean {
  const resourceValues = evalFhirPath(searchParam.expression as string, resource);
  const filterValues = splitSearchOnComma(filter.value);
  const negated = isNegated(filter.operator);
  for (const resourceValue of resourceValues) {
    for (const filterValue of filterValues) {
      const match = matchesDateValue(
        buildDateTimeColumn(resourceValue),
        filter.operator,
        buildDateTimeColumn(filterValue) as string
      );
      if (match) {
        return !negated;
      }
    }
  }
  // If "not equals" and no matches, then return true
  // If "equals" and no matches, then return false
  return negated;
}

function matchesDateValue(resourceValue: string | undefined, operator: Operator, filterValue: string): boolean {
  if (!resourceValue) {
    return false;
  }
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
    case Operator.NOT_EQUALS:
      return resourceValue === filterValue;
    default:
      return false;
  }
}

/**
 * Builds the column value for a date/time parameter.
 * Tries to parse the date string.
 * Silently ignores failure.
 * @param value - The FHIRPath result.
 * @returns The date/time string if parsed; undefined otherwise.
 */
function buildDateTimeColumn(value: unknown): string | undefined {
  if (isString(value)) {
    try {
      const date = new Date(value);
      return date.toISOString();
    } catch (err) {
      console.debug('Failed to parse date', value, err);
    }
  } else if (isPeriod(value)) {
    // Can be a Period
    if ('start' in value) {
      return buildDateTimeColumn(value.start);
    }
    if ('end' in value) {
      return buildDateTimeColumn(value.end);
    }
  }
  return undefined;
}

function isNegated(operator: Operator): boolean {
  return operator === Operator.NOT_EQUALS || operator === Operator.NOT;
}

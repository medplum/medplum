import { capitalize, getSearchParameterDetails, PropertyType, SearchParameterDetails } from '@medplum/core';
import { ResourceType, SearchParameter } from '@medplum/fhirtypes';

interface ImplementationBuilder extends SearchParameterDetails {
  columnName: string;
  implementation: 'column' | 'lookup-table';
}

export interface SearchParameterImplementation extends SearchParameterDetails {
  readonly columnName: string;
  readonly implementation: 'column' | 'lookup-table';
}

interface ResourceTypeSearchParameterInfo {
  searchParamsImplementations: Record<string, SearchParameterImplementation>;
}

type IndexedSearchParameters = {
  types: Record<string, ResourceTypeSearchParameterInfo>;
};

export const globalSearchParameterRegistry: IndexedSearchParameters = { types: {} };

export function getSearchParameterImplementation(
  resourceType: string,
  searchParam: SearchParameter
): SearchParameterImplementation {
  let result: SearchParameterImplementation | undefined =
    globalSearchParameterRegistry.types[resourceType]?.searchParamsImplementations?.[searchParam.code as string];
  if (!result) {
    result = buildSearchParameterImplementation(resourceType, searchParam);
  }
  return result;
}

function setSearchParameterImplementation(
  resourceType: string,
  code: string,
  implementation: SearchParameterImplementation
): void {
  let typeSchema = globalSearchParameterRegistry.types[resourceType];
  if (!typeSchema) {
    typeSchema = { searchParamsImplementations: {} };
    globalSearchParameterRegistry.types[resourceType] = typeSchema;
  }
  typeSchema.searchParamsImplementations[code] = implementation;
}

function buildSearchParameterImplementation(
  resourceType: string,
  searchParam: SearchParameter
): SearchParameterImplementation {
  const code = searchParam.code;
  const builder = getSearchParameterDetails(resourceType, searchParam) as ImplementationBuilder;

  const columnName = convertCodeToColumnName(code);
  builder.columnName = columnName;

  let implementation: ImplementationBuilder['implementation'] = 'column';
  if (!searchParam.base?.includes(resourceType as ResourceType)) {
    // TODO is ignoring this really the right behavior? When does this happen in practice?
    // If the search parameter is not defined on the resource type itself, skip special implementations
  } else if (isLookupTableParam(searchParam, builder)) {
    implementation = 'lookup-table';
  }
  builder.implementation = implementation;

  setSearchParameterImplementation(resourceType, code, builder);
  return builder;
}

/**
 * Converts a hyphen-delimited code to camelCase string.
 * @param code - The search parameter code.
 * @returns The SQL column name.
 */
function convertCodeToColumnName(code: string): string {
  return code.split('-').reduce((result, word, index) => result + (index ? capitalize(word) : word), '');
}

function isLookupTableParam(searchParam: SearchParameter, builder: ImplementationBuilder): boolean {
  // HumanName
  const nameParams = [
    'individual-given',
    'individual-family',
    'Patient-name',
    'Person-name',
    'Practitioner-name',
    'RelatedPerson-name',
  ];
  if (nameParams.includes(searchParam.id as string)) {
    return true;
  }

  // Telecom
  const telecomParams = [
    'individual-telecom',
    'individual-email',
    'individual-phone',
    'OrganizationAffiliation-telecom',
    'OrganizationAffiliation-email',
    'OrganizationAffiliation-phone',
  ];
  if (telecomParams.includes(searchParam.id as string)) {
    // return true;
  }

  // Address
  const addressParams = ['individual-address', 'InsurancePlan-address', 'Location-address', 'Organization-address'];
  if (addressParams.includes(searchParam.id as string)) {
    return true;
  }

  // "address-"
  if (searchParam.code?.startsWith('address-')) {
    return true;
  }

  // Token
  if (isTokenParam(searchParam, builder)) {
    return true;
  }

  return false;
}

function isTokenParam(searchParam: SearchParameter, builder: ImplementationBuilder): boolean {
  if (searchParam.type === 'token') {
    if (searchParam.code?.endsWith(':identifier')) {
      return true;
    }
    for (const elementDefinition of builder.elementDefinitions ?? []) {
      // Check for any "Identifier", "CodeableConcept", or "Coding"
      // Any of those value types require the "Token" table for full system|value search semantics.
      // The common case is that the "type" property only has one value,
      // but we need to support arrays of types for the choice-of-type properties such as "value[x]".
      for (const type of elementDefinition.type ?? []) {
        if (
          type.code === PropertyType.Identifier ||
          type.code === PropertyType.CodeableConcept ||
          type.code === PropertyType.Coding ||
          type.code === PropertyType.ContactPoint
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

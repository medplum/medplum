import { capitalize, getSearchParameterDetails, SearchParameterDetails } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';

interface ImplementationBuilder extends SearchParameterDetails {
  columnName: string;
}

export interface SearchParameterImplementation extends SearchParameterDetails {
  readonly columnName: string;
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
  const columnName = convertCodeToColumnName(code);
  const impl = getSearchParameterDetails(resourceType, searchParam) as ImplementationBuilder;
  impl.columnName = columnName;
  setSearchParameterImplementation(resourceType, code, impl);
  return impl;
}

/**
 * Converts a hyphen-delimited code to camelCase string.
 * @param code - The search parameter code.
 * @returns The SQL column name.
 */
function convertCodeToColumnName(code: string): string {
  return code.split('-').reduce((result, word, index) => result + (index ? capitalize(word) : word), '');
}

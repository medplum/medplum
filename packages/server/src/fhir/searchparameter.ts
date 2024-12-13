import { capitalize, getSearchParameterDetails, SearchParameterDetails } from '@medplum/core';
import { ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { HumanNameTable } from './lookups/humanname';
import { AddressTable } from './lookups/address';
import { CodingTable } from './lookups/coding';
import { LookupTable } from './lookups/lookuptable';
import { ReferenceTable } from './lookups/reference';
import { TokenTable } from './lookups/token';
import { ValueSetElementTable } from './lookups/valuesetelement';

interface ImplementationBuilder extends SearchParameterDetails {
  columnName: string;
  storagePattern: 'column' | 'lookup-table';
}

export interface SearchParameterImplementation extends SearchParameterDetails {
  readonly columnName: string;
  readonly storagePattern: 'column' | 'lookup-table';
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

  let storagePattern: ImplementationBuilder['storagePattern'] = 'column';
  if (!searchParam.base?.includes(resourceType as ResourceType)) {
    // TODO is ignoring this really the right behavior? When does this happen in practice?
    // If the search parameter is not defined on the resource type itself, skip special implementations
  } else if (getLookupTable(resourceType, searchParam)) {
    storagePattern = 'lookup-table';
  }
  builder.storagePattern = storagePattern;

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

/**
 * The lookup tables array includes a list of special tables for search indexing.
 */
export const lookupTables: LookupTable[] = [
  new AddressTable(),
  new HumanNameTable(),
  new TokenTable(),
  new ValueSetElementTable(),
  new ReferenceTable(),
  new CodingTable(),
];

export function getLookupTable(resourceType: string, searchParam: SearchParameter): LookupTable | undefined {
  for (const lookupTable of lookupTables) {
    if (lookupTable.isIndexed(searchParam, resourceType)) {
      return lookupTable;
    }
  }
  return undefined;
}

import { capitalize, getSearchParameterDetails, SearchParameterDetails } from '@medplum/core';
import { ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { HumanNameTable } from './lookups/humanname';
import { AddressTable } from './lookups/address';
import { CodingTable } from './lookups/coding';
import { LookupTable } from './lookups/lookuptable';
import { ReferenceTable } from './lookups/reference';
import { TokenTable } from './lookups/token';
import { ValueSetElementTable } from './lookups/valuesetelement';

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export interface ColumnSearchParameterImplementation extends SearchParameterDetails {
  readonly searchStrategy: 'column';
  readonly columnName: string;
}

export interface LookupTableSearchParameterImplementation extends SearchParameterDetails {
  readonly searchStrategy: 'lookup-table';
  readonly lookupTable: LookupTable;
}

export interface TokenColumnSearchParameterImplementation extends SearchParameterDetails {
  readonly searchStrategy: 'token-column';
  readonly columnName: string;
}

export type SearchParameterImplementation =
  | ColumnSearchParameterImplementation
  | LookupTableSearchParameterImplementation
  | TokenColumnSearchParameterImplementation;

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
    setSearchParameterImplementation(resourceType, searchParam.code, result);
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

const TelecomTokenSearchParameterIds = [
  'individual-telecom',
  'individual-email',
  'individual-phone',
  'OrganizationAffiliation-telecom',
  'OrganizationAffiliation-email',
  'OrganizationAffiliation-phone',
];

function buildSearchParameterImplementation(
  resourceType: string,
  searchParam: SearchParameter
): SearchParameterImplementation {
  const code = searchParam.code;
  const impl = getSearchParameterDetails(resourceType, searchParam) as SearchParameterImplementation;

  let lookupTable: LookupTable | undefined;
  if (searchParam.code.startsWith('_XXX')) {
    console.log(`Skipping special implementation for internal search parameter: ${searchParam.code}`);
  } else if (!searchParam.base?.includes(resourceType as ResourceType)) {
    console.log(`Skipping special implementation for search parameter: ${searchParam.code} ${searchParam.base}`);
    // If the search parameter is not defined on the resource type itself, skip special implementations
  } else if (TokenTable.isIndexed(searchParam, resourceType)) {
    const writeable = impl as Writeable<TokenColumnSearchParameterImplementation>;
    writeable.searchStrategy = 'token-column';

    if (TelecomTokenSearchParameterIds.includes(searchParam.id as string)) {
      writeable.columnName = 'telecom';
    } else {
      writeable.columnName = convertCodeToColumnName(code);
    }
    return impl;
  } else if ((lookupTable = getLookupTable(resourceType, searchParam))) {
    const writeable = impl as Writeable<LookupTableSearchParameterImplementation>;
    writeable.searchStrategy = 'lookup-table';
    writeable.lookupTable = lookupTable;
    return impl;
  }

  const writeable = impl as Writeable<ColumnSearchParameterImplementation>;
  writeable.searchStrategy = 'column';
  writeable.columnName = convertCodeToColumnName(code);

  return impl;
}

/**
 * Converts a hyphen-delimited code to camelCase string.
 * @param code - The search parameter code.
 * @returns The SQL column name.
 */
function convertCodeToColumnName(code: string): string {
  return code.split(/[-:]/).reduce((result, word, index) => result + (index ? capitalize(word) : word), '');
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

function getLookupTable(resourceType: string, searchParam: SearchParameter): LookupTable | undefined {
  for (const lookupTable of lookupTables) {
    if (lookupTable.isIndexed(searchParam, resourceType)) {
      return lookupTable;
    }
  }
  return undefined;
}

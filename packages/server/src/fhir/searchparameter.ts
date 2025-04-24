import { capitalize, getSearchParameterDetails, SearchParameterDetails } from '@medplum/core';
import { ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { AddressTable } from './lookups/address';
import { CodingTable } from './lookups/coding';
import { HumanNameTable } from './lookups/humanname';
import { LookupTable } from './lookups/lookuptable';
import { ReferenceTable } from './lookups/reference';
import { TokenTable } from './lookups/token';

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export const SearchStrategies = {
  COLUMN: 'column',
  LOOKUP_TABLE: 'lookup-table',
  TOKEN_COLUMN: 'token-column',
} as const;

export interface ColumnSearchParameterImplementation extends SearchParameterDetails {
  readonly searchStrategy: typeof SearchStrategies.COLUMN;
  readonly columnName: string;
}

export interface LookupTableSearchParameterImplementation extends SearchParameterDetails {
  readonly searchStrategy: typeof SearchStrategies.LOOKUP_TABLE;
  readonly lookupTable: LookupTable;
}

export interface TokenColumnSearchParameterImplementation extends SearchParameterDetails {
  readonly searchStrategy: typeof SearchStrategies.TOKEN_COLUMN;
  readonly legacyColumnName: string;
  readonly legacyTextSearchColumnName: string;
  readonly systemColumnName: string;
  readonly valueColumnName: string;
  readonly systemValueColumnName: string;
  readonly sortColumnName: string;
  readonly textSearchColumnName: string;
  readonly lookupTable: LookupTable;
  readonly caseInsensitive: boolean;
  readonly textSearch: boolean;
}

export type SearchParameterImplementation =
  | ColumnSearchParameterImplementation
  | LookupTableSearchParameterImplementation
  | TokenColumnSearchParameterImplementation;

interface ResourceTypeSearchParameterInfo {
  searchParamsImplementations: Record<string, SearchParameterImplementation>;
  legacyTokenSearchParamsImplementations: Record<string, ColumnSearchParameterImplementation>;
}

type IndexedSearchParameters = {
  types: Record<string, ResourceTypeSearchParameterInfo>;
};

export const globalSearchParameterRegistry: IndexedSearchParameters = { types: {} };

export function getSearchParameterImplementation(
  resourceType: string,
  searchParam: SearchParameter,
  forceColumnImplementation: true
): ColumnSearchParameterImplementation;
export function getSearchParameterImplementation(
  resourceType: string,
  searchParam: SearchParameter
): SearchParameterImplementation;
export function getSearchParameterImplementation(
  resourceType: string,
  searchParam: SearchParameter,
  forceColumnImplementation?: boolean
): SearchParameterImplementation {
  if (forceColumnImplementation) {
    let legacyImpl: ColumnSearchParameterImplementation | undefined =
      globalSearchParameterRegistry.types[resourceType]?.legacyTokenSearchParamsImplementations?.[
        searchParam.code as string
      ];
    if (!legacyImpl) {
      legacyImpl = buildSearchParameterImplementation(
        resourceType,
        searchParam,
        true
      ) as ColumnSearchParameterImplementation;
      setSearchParameterImplementation(resourceType, searchParam.code, legacyImpl, true);
    }
    return legacyImpl;
  }

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
  implementation: SearchParameterImplementation,
  isLegacy?: boolean
): void {
  let typeSchema = globalSearchParameterRegistry.types[resourceType];
  if (!typeSchema) {
    typeSchema = { searchParamsImplementations: {}, legacyTokenSearchParamsImplementations: {} };
    globalSearchParameterRegistry.types[resourceType] = typeSchema;
  }
  if (isLegacy) {
    typeSchema.legacyTokenSearchParamsImplementations[code] = implementation as ColumnSearchParameterImplementation;
  } else {
    typeSchema.searchParamsImplementations[code] = implementation;
  }
}

const ContainsSupportSearchParameterIds = [
  'individual-email',
  'individual-phone',
  'individual-telecom',
  'NamingSystem-telecom',
  'OrganizationAffiliation-email',
  'OrganizationAffiliation-phone',
  'OrganizationAffiliation-telecom',
];

function buildSearchParameterImplementation(
  resourceType: string,
  searchParam: SearchParameter,
  forceColumnImplementation?: boolean
): SearchParameterImplementation {
  const code = searchParam.code;
  let impl = getSearchParameterDetails(resourceType, searchParam) as SearchParameterImplementation;

  if (forceColumnImplementation) {
    // Since impl manipulates the object returned from `getSearchParameterDetails`,
    // make a copy of only the `SearchParameterDetails` properties so we are starting over
    impl = {
      type: impl.type,
      elementDefinitions: impl.elementDefinitions,
      array: impl.array,
    } as SearchParameterImplementation;
  }

  if (!searchParam.base?.includes(resourceType as ResourceType)) {
    throw new Error(`SearchParameter.base does not include ${resourceType} for ${searchParam.id ?? searchParam.code}`);
  }

  const lookupTable = forceColumnImplementation ? undefined : getLookupTable(resourceType, searchParam);
  if (lookupTable === tokenTable) {
    const writeable = impl as Writeable<TokenColumnSearchParameterImplementation>;
    writeable.searchStrategy = 'token-column';
    writeable.lookupTable = lookupTable;

    const baseName = convertCodeToColumnName(code);
    writeable.systemColumnName = '__' + baseName + 'System';
    writeable.valueColumnName = '__' + baseName + 'Value';
    writeable.systemValueColumnName = '__' + baseName + 'SystemValue';
    writeable.sortColumnName = '__' + baseName + 'Sort';
    writeable.textSearchColumnName = '__' + baseName + 'Text';

    writeable.legacyColumnName = '__tokens';
    writeable.legacyTextSearchColumnName = '__tokensText';

    writeable.caseInsensitive = tokenTable.isCaseInsensitive(searchParam, resourceType);
    writeable.textSearch = ContainsSupportSearchParameterIds.includes(searchParam.id as string);
    return impl;
  } else if (lookupTable) {
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
  // hyphen is common in SearchParameter.code
  // colon is used in Medplum "derived" search parameters, see deriveIdentifierSearchParameter
  return code.split(/[-:]/).reduce((result, word, index) => result + (index ? capitalize(word) : word), '');
}

const tokenTable = new TokenTable();

/**
 * The lookup tables array includes a list of special tables for search indexing.
 */
export const lookupTables: LookupTable[] = [
  new AddressTable(),
  new HumanNameTable(),
  tokenTable,
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

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { capitalize, getSearchParameterDetails, SearchParameterDetails } from '@medplum/core';
import { ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { AddressTable } from './lookups/address';
import { CodingTable } from './lookups/coding';
import { HumanNameSearchParameterIds, HumanNameTable } from './lookups/humanname';
import { LookupTable } from './lookups/lookuptable';
import { ReferenceTable } from './lookups/reference';
import { getTokenIndexType, TokenIndexTypes } from './tokens';

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
  readonly sortColumnName: string | undefined;
}

export interface TokenColumnSearchParameterImplementation extends SearchParameterDetails {
  readonly searchStrategy: typeof SearchStrategies.TOKEN_COLUMN;
  readonly hasDedicatedColumns: boolean;
  readonly tokenColumnName: string;
  readonly sortColumnName: string;
  readonly textSearchColumnName: string;
  readonly caseInsensitive: boolean;
  readonly textSearch: boolean;
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
  searchParam: SearchParameter
): SearchParameterImplementation {
  const code = searchParam.code;
  const impl = getSearchParameterDetails(resourceType, searchParam) as SearchParameterImplementation;

  if (!searchParam.base?.includes(resourceType as ResourceType)) {
    throw new Error(`SearchParameter.base does not include ${resourceType} for ${searchParam.id ?? searchParam.code}`);
  }

  const tokenIndexType = getTokenIndexType(searchParam, resourceType);
  if (tokenIndexType) {
    const writeable = impl as Writeable<TokenColumnSearchParameterImplementation>;
    writeable.searchStrategy = 'token-column';

    const baseName = convertCodeToColumnName(code);
    if (hasDedicatedTokenColumns(searchParam, resourceType)) {
      writeable.hasDedicatedColumns = true;
      writeable.tokenColumnName = '__' + baseName;
      writeable.textSearchColumnName = '__' + baseName + 'Text';
    } else {
      writeable.hasDedicatedColumns = false;
      writeable.tokenColumnName = '__sharedTokens';
      writeable.textSearchColumnName = '__sharedTokensText';
    }
    writeable.sortColumnName = '__' + baseName + 'Sort';

    writeable.caseInsensitive = tokenIndexType === TokenIndexTypes.CASE_INSENSITIVE;
    writeable.textSearch = ContainsSupportSearchParameterIds.includes(searchParam.id as string);
    return impl;
  }

  const lookupTable = getLookupTable(resourceType, searchParam);
  if (lookupTable) {
    const writeable = impl as Writeable<LookupTableSearchParameterImplementation>;
    writeable.searchStrategy = 'lookup-table';
    writeable.lookupTable = lookupTable;

    if (HumanNameSearchParameterIds.has(searchParam.id as string)) {
      writeable.sortColumnName = '__' + convertCodeToColumnName(code) + 'Sort';
    }
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

/**
 * The lookup tables array includes a list of special tables for search indexing.
 */
export const lookupTables: LookupTable[] = [
  new AddressTable(),
  new HumanNameTable(),
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

// This list of exceptions was constructed by analyzing the 15 resource types with the most token usage
// and looking for the search parameters with zero or near-zero usage.
//
// The goal is to avoid creating dedicated token columns for search parameters that are rarely used
// to keep the database schema smaller and have fewer indexes to be maintained
// Specified as <ResourceType>|<SearchParameterCode> as the key instead of <SearchParameterId>
// since not all search parameters have IDs; namely Medplum's derived referenced identifier search parameters
const DedicatedTokenColumnsOverridesByResourceTypeAndCode: Record<string, boolean> = {
  // rarely used search parameters on resource types with high token usage
  'AuditEvent|entity-type': false,
  'AuditEvent|agent-role': false,
  'AuditEvent|subtype': false,
  'AuditEvent|_tag': false,
  'Observation|component-data-absent-reason': false,
  'Encounter|special-arrangement': false,
  'ServiceRequest|body-site': false,
  'Condition|body-site': false,
  'Condition|evidence': false,
  'DiagnosticReport|conclusion': false,
  'DocumentReference|setting': false,
  'DocumentReference|event': false,
  'EvidenceVariable|context': false,
  'EvidenceVariable|context-type': false,
  'EvidenceVariable|jurisdiction': false,
  'EvidenceVariable|topic': false,
  'MedicationRequest|intended-performertype': false,
  'ResearchStudy|category': false,
  'ResearchStudy|classifier': false,
  'ResearchStudy|focus': false,
  'ResearchStudy|location': false,
  'ResearchStudy|objective-type': false,
  'ResearchStudy|region': false,
  'Appointment|reason-code': false,

  // Overrides for more frequently used search parameters that would otherwise default to `false`
  'Observation|patient:identifier': true,
  'Observation|performer:identifier': true,
  'Observation|subject:identifier': true,
  'ServiceRequest|subject:identifier': true,
  'ResearchStudy|eligibility:identifier': true,
  'DiagnosticReport|result:identifier': true,
};

function hasDedicatedTokenColumns(searchParam: SearchParameter, resourceType: string): boolean {
  if (searchParam.type !== 'token') {
    throw new Error(
      `hasDedicatedTokenColumns only supports token search parameters, but ${searchParam.id ?? searchParam.code} is ${searchParam.type}`
    );
  }

  if (DedicatedTokenColumnsOverridesByResourceTypeAndCode[`${resourceType}|${searchParam.code}`] !== undefined) {
    return DedicatedTokenColumnsOverridesByResourceTypeAndCode[`${resourceType}|${searchParam.code}`];
  }

  if (searchParam.code.endsWith(':identifier')) {
    return false;
  }

  if (searchParam.code === '_security') {
    return false;
  }

  return true;
}

import { Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { badRequest, OperationOutcomeError } from '../outcomes';
import { globalSchema } from '../types';

export const DEFAULT_SEARCH_COUNT = 20;

export interface SearchRequest<T extends Resource = Resource> {
  readonly resourceType: T['resourceType'];
  filters?: Filter[];
  sortRules?: SortRule[];
  offset?: number;
  count?: number;
  fields?: string[];
  name?: string;
  total?: 'none' | 'estimate' | 'accurate';
  include?: IncludeTarget[];
  revInclude?: IncludeTarget[];
}

export interface Filter {
  code: string;
  operator: Operator;
  value: string;
  unitSystem?: string;
  unitCode?: string;
}

export interface SortRule {
  code: string;
  descending?: boolean;
}

export interface IncludeTarget {
  resourceType: string;
  searchParam: string;
  targetType?: string;
  modifier?: string;
}

/**
 * Search operators.
 * These operators represent "modifiers" and "prefixes" in FHIR search.
 * See: https://www.hl7.org/fhir/search.html
 */
export enum Operator {
  EQUALS = 'eq',
  NOT_EQUALS = 'ne',

  // Numbers
  GREATER_THAN = 'gt',
  LESS_THAN = 'lt',
  GREATER_THAN_OR_EQUALS = 'ge',
  LESS_THAN_OR_EQUALS = 'le',

  // Dates
  STARTS_AFTER = 'sa',
  ENDS_BEFORE = 'eb',
  APPROXIMATELY = 'ap',

  // String
  CONTAINS = 'contains',
  EXACT = 'exact',

  // Token
  TEXT = 'text',
  NOT = 'not',
  ABOVE = 'above',
  BELOW = 'below',
  IN = 'in',
  NOT_IN = 'not-in',
  OF_TYPE = 'of-type',

  // All
  MISSING = 'missing',

  // Reference
  IDENTIFIER = 'identifier',

  // _include and _revinclude
  ITERATE = 'iterate',
}

/**
 * Parameter names may specify a modifier as a suffix.
 * The modifiers are separated from the parameter name by a colon.
 * See: https://www.hl7.org/fhir/search.html#modifiers
 */
const MODIFIER_OPERATORS: Record<string, Operator> = {
  contains: Operator.CONTAINS,
  exact: Operator.EXACT,
  above: Operator.ABOVE,
  below: Operator.BELOW,
  text: Operator.TEXT,
  not: Operator.NOT,
  in: Operator.IN,
  'not-in': Operator.NOT_IN,
  'of-type': Operator.OF_TYPE,
  missing: Operator.MISSING,
  identifier: Operator.IDENTIFIER,
  iterate: Operator.ITERATE,
};

/**
 * For the ordered parameter types of number, date, and quantity,
 * a prefix to the parameter value may be used to control the nature
 * of the matching.
 * See: https://www.hl7.org/fhir/search.html#prefix
 */
const PREFIX_OPERATORS: Record<string, Operator> = {
  eq: Operator.EQUALS,
  ne: Operator.NOT_EQUALS,
  lt: Operator.LESS_THAN,
  le: Operator.LESS_THAN_OR_EQUALS,
  gt: Operator.GREATER_THAN,
  ge: Operator.GREATER_THAN_OR_EQUALS,
  sa: Operator.STARTS_AFTER,
  eb: Operator.ENDS_BEFORE,
  ap: Operator.APPROXIMATELY,
};

/**
 * Parses a search URL into a search request.
 * @param resourceType The FHIR resource type.
 * @param query The collection of query string parameters.
 * @returns A parsed SearchRequest.
 */
export function parseSearchRequest<T extends Resource = Resource>(
  resourceType: T['resourceType'],
  query: Record<string, string[] | string | undefined>
): SearchRequest<T> {
  const queryArray: [string, string][] = [];
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        queryArray.push([key, v]);
      }
    } else {
      queryArray.push([key, value || '']);
    }
  }
  return parseSearchImpl(resourceType, queryArray);
}

/**
 * Parses a search URL into a search request.
 * @param url The search URL.
 * @returns A parsed SearchRequest.
 */
export function parseSearchUrl<T extends Resource = Resource>(url: URL): SearchRequest<T> {
  const resourceType = url.pathname.split('/').filter(Boolean).pop() as ResourceType;
  return parseSearchImpl<T>(resourceType, url.searchParams.entries());
}

/**
 * Parses a URL string into a SearchRequest.
 * @param url The URL to parse.
 * @returns Parsed search definition.
 */
export function parseSearchDefinition<T extends Resource = Resource>(url: string): SearchRequest<T> {
  return parseSearchUrl<T>(new URL(url, 'https://example.com/'));
}

/**
 * Parses a FHIR criteria string into a SearchRequest.
 * FHIR criteria strings are found on resources such as Subscription.
 * @param criteria The FHIR criteria string.
 * @returns Parsed search definition.
 */
export function parseCriteriaAsSearchRequest(criteria: string): SearchRequest {
  return parseSearchUrl(new URL(criteria, 'https://api.medplum.com/'));
}

function parseSearchImpl<T extends Resource = Resource>(
  resourceType: T['resourceType'],
  query: [string, string][] | IterableIterator<[string, string]>
): SearchRequest<T> {
  const searchRequest: SearchRequest<T> = {
    resourceType,
  };

  for (const [key, value] of query) {
    parseKeyValue(searchRequest, key, value);
  }

  return searchRequest;
}

function parseKeyValue(searchRequest: SearchRequest, key: string, value: string): void {
  let code;
  let modifier;

  const colonIndex = key.indexOf(':');
  if (colonIndex >= 0) {
    code = key.substring(0, colonIndex);
    modifier = key.substring(colonIndex + 1);
  } else {
    code = key;
    modifier = '';
  }

  switch (code) {
    case '_sort':
      parseSortRule(searchRequest, value);
      break;

    case '_count':
      searchRequest.count = parseInt(value, 10);
      break;

    case '_offset':
      searchRequest.offset = parseInt(value, 10);
      break;

    case '_total':
      searchRequest.total = value as 'none' | 'estimate' | 'accurate';
      break;

    case '_summary':
      searchRequest.total = 'accurate';
      searchRequest.count = 0;
      break;

    case '_include': {
      const target = parseIncludeTarget(value);
      if (modifier === 'iterate') {
        target.modifier = Operator.ITERATE;
      }
      if (searchRequest.include) {
        searchRequest.include.push(target);
      } else {
        searchRequest.include = [target];
      }
      break;
    }

    case '_revinclude': {
      const target = parseIncludeTarget(value);
      if (modifier === 'iterate') {
        target.modifier = Operator.ITERATE;
      }
      if (searchRequest.revInclude) {
        searchRequest.revInclude.push(target);
      } else {
        searchRequest.revInclude = [target];
      }
      break;
    }

    case '_fields':
      searchRequest.fields = value.split(',');
      break;

    default: {
      const param = globalSchema.types[searchRequest.resourceType]?.searchParams?.[code];
      if (param) {
        parseParameter(searchRequest, param, modifier, value);
      } else {
        parseUnknownParameter(searchRequest, code, modifier, value);
      }
    }
  }
}

function parseSortRule(searchRequest: SearchRequest, value: string): void {
  for (const field of value.split(',')) {
    let code;
    let descending = false;
    if (field.startsWith('-')) {
      code = field.substring(1);
      descending = true;
    } else {
      code = field;
    }
    if (!searchRequest.sortRules) {
      searchRequest.sortRules = [];
    }
    searchRequest.sortRules.push({ code, descending });
  }
}

function parseParameter(
  searchRequest: SearchRequest,
  searchParam: SearchParameter,
  modifier: string,
  value: string
): void {
  if (modifier === 'missing') {
    addFilter(searchRequest, {
      code: searchParam.code as string,
      operator: Operator.MISSING,
      value,
    });
    return;
  }
  switch (searchParam.type) {
    case 'number':
    case 'date':
      parsePrefixType(searchRequest, searchParam, value);
      break;
    case 'reference':
    case 'string':
    case 'token':
    case 'uri':
      parseModifierType(searchRequest, searchParam, modifier, value);
      break;
    case 'quantity':
      parseQuantity(searchRequest, searchParam, value);
      break;
    default:
      break;
  }
}

function parsePrefixType(searchRequest: SearchRequest, param: SearchParameter, input: string): void {
  const { operator, value } = parsePrefix(input);
  addFilter(searchRequest, {
    code: param.code as string,
    operator,
    value,
  });
}

function parseModifierType(
  searchRequest: SearchRequest,
  param: SearchParameter,
  modifier: string,
  value: string
): void {
  addFilter(searchRequest, {
    code: param.code as string,
    operator: parseModifier(modifier),
    value,
  });
}

function parseQuantity(searchRequest: SearchRequest, param: SearchParameter, input: string): void {
  const [prefixNumber, unitSystem, unitCode] = input.split('|');
  const { operator, value } = parsePrefix(prefixNumber);
  addFilter(searchRequest, {
    code: param.code as string,
    operator,
    value,
    unitSystem,
    unitCode,
  });
}

function parseUnknownParameter(searchRequest: SearchRequest, code: string, modifier: string, value: string): void {
  let operator = Operator.EQUALS;
  if (modifier) {
    operator = modifier as Operator;
  } else if (value.length >= 2) {
    const prefix = value.substring(0, 2);
    if (prefix in PREFIX_OPERATORS) {
      if (value.length === 2 || value.at(2)?.match(/\d/)) {
        operator = prefix as Operator;
        value = value.substring(prefix.length);
      }
    }
  }

  addFilter(searchRequest, {
    code,
    operator,
    value,
  });
}

function parsePrefix(input: string): { operator: Operator; value: string } {
  const prefix = input.substring(0, 2);
  const prefixOperator = PREFIX_OPERATORS[prefix];
  if (prefixOperator) {
    return { operator: prefixOperator, value: input.substring(2) };
  }
  return { operator: Operator.EQUALS, value: input };
}

function parseModifier(modifier: string): Operator {
  return MODIFIER_OPERATORS[modifier] || Operator.EQUALS;
}

function parseIncludeTarget(input: string): IncludeTarget {
  const parts = input.split(':');

  parts.forEach((p) => {
    if (p === '*') {
      throw new OperationOutcomeError(badRequest(`'*' is not supported as a value for search inclusion parameters`));
    }
  });

  if (parts.length === 1) {
    // Full wildcard, not currently supported
    throw new OperationOutcomeError(
      badRequest(`Invalid include value '${input}': must be of the form ResourceType:search-parameter`)
    );
  } else if (parts.length === 2) {
    return {
      resourceType: parts[0],
      searchParam: parts[1],
    };
  } else if (parts.length === 3) {
    return {
      resourceType: parts[0],
      searchParam: parts[1],
      targetType: parts[2],
    };
  } else {
    throw new OperationOutcomeError(badRequest(`Invalid include value '${input}'`));
  }
}

function addFilter(searchRequest: SearchRequest, filter: Filter): void {
  if (searchRequest.filters) {
    searchRequest.filters.push(filter);
  } else {
    searchRequest.filters = [filter];
  }
}

/**
 * Formats a search definition object into a query string.
 * Note: The return value does not include the resource type.
 * @param definition The search definition.
 * @returns Formatted URL.
 */
export function formatSearchQuery(definition: SearchRequest): string {
  const params: string[] = [];

  if (definition.fields) {
    params.push('_fields=' + definition.fields.join(','));
  }

  if (definition.filters) {
    definition.filters.forEach((filter) => params.push(formatFilter(filter)));
  }

  if (definition.sortRules && definition.sortRules.length > 0) {
    params.push(formatSortRules(definition.sortRules));
  }

  if (definition.offset !== undefined) {
    params.push('_offset=' + definition.offset);
  }

  if (definition.count !== undefined) {
    params.push('_count=' + definition.count);
  }

  if (definition.total !== undefined) {
    params.push('_total=' + definition.total);
  }

  if (params.length === 0) {
    return '';
  }

  params.sort((a, b) => a.localeCompare(b));
  return '?' + params.join('&');
}

function formatFilter(filter: Filter): string {
  const modifier = filter.operator in MODIFIER_OPERATORS ? ':' + filter.operator : '';
  const prefix = filter.operator !== Operator.EQUALS && filter.operator in PREFIX_OPERATORS ? filter.operator : '';
  return `${filter.code}${modifier}=${prefix}${encodeURIComponent(filter.value)}`;
}

function formatSortRules(sortRules: SortRule[]): string {
  return '_sort=' + sortRules.map((sr) => (sr.descending ? '-' + sr.code : sr.code)).join(',');
}

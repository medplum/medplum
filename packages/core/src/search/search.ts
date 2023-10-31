import { Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { badRequest, OperationOutcomeError } from '../outcomes';
import { TypedValue, stringifyTypedValue, globalSchema, getSearchParameter } from '../types';
import { evalFhirPathTyped } from '../fhirpath/parse';
import { SearchParameterDetails, getSearchParameterDetails } from './details';

export const DEFAULT_SEARCH_COUNT = 20;

export interface SearchRequest<T extends Resource = Resource> {
  readonly resourceType: T['resourceType'];
  chains?: ChainedSearchParameter[];
  filters?: Filter[];
  sortRules?: SortRule[];
  offset?: number;
  count?: number;
  fields?: string[];
  name?: string;
  total?: 'none' | 'estimate' | 'accurate';
  include?: IncludeTarget[];
  revInclude?: IncludeTarget[];
  summary?: 'true' | 'text' | 'data';
}

export interface Filter {
  code: string;
  operator: Operator;
  value: string;
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

export interface ChainedSearchLink {
  resourceType: string;
  searchParam: SearchParameter;
  details: SearchParameterDetails;
  reverse?: boolean;
  filter?: Filter;
}

export interface ChainedSearchParameter {
  chain: ChainedSearchLink[];
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
 * @param resourceType - The FHIR resource type.
 * @param query - The collection of query string parameters.
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
      queryArray.push([key, value ?? '']);
    }
  }
  return parseSearchImpl(resourceType, queryArray);
}

/**
 * Parses a search URL into a search request.
 * @param url - The search URL.
 * @returns A parsed SearchRequest.
 */
export function parseSearchUrl<T extends Resource = Resource>(url: URL): SearchRequest<T> {
  let resourceType;
  for (const part of url.pathname.split('/')) {
    if (part) {
      resourceType = part;
    }
  }
  return parseSearchImpl<T>(resourceType as ResourceType, url.searchParams.entries());
}

/**
 * Parses a URL string into a SearchRequest.
 * @param url - The URL to parse.
 * @returns Parsed search definition.
 */
export function parseSearchDefinition<T extends Resource = Resource>(url: string): SearchRequest<T> {
  return parseSearchUrl<T>(new URL(url, 'https://example.com/'));
}

/**
 * Parses a FHIR criteria string into a SearchRequest.
 * FHIR criteria strings are found on resources such as Subscription.
 * @param criteria - The FHIR criteria string.
 * @returns Parsed search definition.
 */
export function parseCriteriaAsSearchRequest(criteria: string): SearchRequest {
  return parseSearchUrl(new URL(criteria, 'https://api.medplum.com/'));
}

function parseSearchImpl<T extends Resource = Resource>(
  resourceType: T['resourceType'],
  query: Iterable<[string, string]>
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

  if (key.startsWith('_has') || key.includes('.')) {
    const chain = parseChainedParameter(searchRequest.resourceType, key, value);
    if (!searchRequest.chains) {
      searchRequest.chains = [chain];
    } else {
      searchRequest.chains.push(chain);
    }
    return;
  }

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
      if (value === 'count') {
        searchRequest.total = 'accurate';
        searchRequest.count = 0;
      } else if (value === 'true' || value === 'data' || value === 'text') {
        searchRequest.summary = value;
      }
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
    case '_elements':
      searchRequest.fields = value.split(',');
      break;

    default: {
      const param = globalSchema.types[searchRequest.resourceType]?.searchParams?.[code];
      if (param) {
        addFilter(searchRequest, parseParameter(param, modifier, value));
      } else {
        addFilter(searchRequest, parseUnknownParameter(code, modifier, value));
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

function parseParameter(searchParam: SearchParameter, modifier: string, value: string): Filter {
  if (modifier === 'missing') {
    return {
      code: searchParam.code as string,
      operator: Operator.MISSING,
      value,
    };
  }
  switch (searchParam.type) {
    case 'number':
    case 'date':
    case 'quantity':
      return parsePrefixType(searchParam, value);
    case 'reference':
    case 'string':
    case 'token':
    case 'uri':
      return parseModifierType(searchParam, modifier, value);
    default:
      throw new Error('Unrecognized search parameter type: ' + searchParam.type);
  }
}

function parsePrefixType(param: SearchParameter, input: string): Filter {
  const { operator, value } = parsePrefix(input);
  return {
    code: param.code as string,
    operator,
    value,
  };
}

function parseModifierType(param: SearchParameter, modifier: string, value: string): Filter {
  return {
    code: param.code as string,
    operator: parseModifier(modifier),
    value,
  };
}

function parseUnknownParameter(code: string, modifier: string, value: string): Filter {
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
  return { code, operator, value };
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
  return MODIFIER_OPERATORS[modifier] ?? Operator.EQUALS;
}

function parseIncludeTarget(input: string): IncludeTarget {
  const parts = input.split(':');

  if (parts.includes('*')) {
    throw new OperationOutcomeError(badRequest(`'*' is not supported as a value for search inclusion parameters`));
  }

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

function parseChainedParameter(resourceType: string, key: string, value: string): ChainedSearchParameter {
  const param: ChainedSearchParameter = {
    chain: [],
  };
  let currentResourceType = resourceType;

  const parts = splitChainedSearch(key);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('_has')) {
      const link = parseReverseChainLink(part, currentResourceType);
      param.chain.push(link);
      currentResourceType = link.resourceType;
    } else if (i === parts.length - 1) {
      const [code, modifier] = part.split(':', 2);
      const searchParam = getSearchParameter(currentResourceType, part);
      if (!searchParam) {
        throw new Error(`Invalid search parameter in chain: ${currentResourceType}?${code}`);
      }
      param.chain[param.chain.length - 1].filter = parseParameter(searchParam, modifier, value);
    } else {
      const link = parseChainLink(part, currentResourceType);
      param.chain.push(link);
      currentResourceType = link.resourceType;
    }
  }
  return param;
}

function parseChainLink(param: string, currentResourceType: string): ChainedSearchLink {
  const [code, modifier] = param.split(':', 2);
  const searchParam = getSearchParameter(currentResourceType, code);
  if (!searchParam) {
    throw new Error(`Invalid search parameter in chain: ${currentResourceType}?${code}`);
  }
  let resourceType: string;
  if (searchParam.target?.length === 1) {
    resourceType = searchParam.target[0];
  } else if (searchParam.target?.includes(modifier as ResourceType)) {
    resourceType = modifier;
  } else {
    throw new Error(`Unable to identify next resource type for search parameter: ${currentResourceType}?${code}`);
  }
  const details = getSearchParameterDetails(currentResourceType, searchParam);
  return { resourceType, searchParam, details };
}

function parseReverseChainLink(param: string, targetResourceType: string): ChainedSearchLink {
  const [, resourceType, code] = param.split(':', 3);
  const searchParam = getSearchParameter(resourceType, code);
  if (!searchParam) {
    throw new Error(`Invalid search parameter in chain: ${resourceType}?${code}`);
  } else if (!searchParam.target?.includes(targetResourceType as ResourceType)) {
    throw new Error(
      `Invalid reverse chain link: search parameter ${resourceType}?${code} does not refer to ${targetResourceType}`
    );
  }
  const details = getSearchParameterDetails(resourceType, searchParam);
  return { resourceType, searchParam, details, reverse: true };
}

function splitChainedSearch(chain: string): string[] {
  const params: string[] = [];
  while (chain) {
    const peek = chain.slice(0, 5);
    if (peek === '_has:') {
      const resourceTypeDelim = chain.indexOf(':', 5);
      const codeDelim = chain.indexOf(':', resourceTypeDelim + 1);
      if (resourceTypeDelim < 0 || resourceTypeDelim >= codeDelim) {
        throw new Error('Invalid search chain: ' + chain);
      }
      params.push(chain.slice(0, codeDelim));
      chain = chain.slice(codeDelim + 1);
    } else {
      let nextDot = chain.indexOf('.');
      if (nextDot === -1) {
        nextDot = chain.length;
      }
      params.push(chain.slice(0, nextDot));
      chain = chain.slice(nextDot + 1);
    }
  }
  return params;
}

function addFilter(searchRequest: SearchRequest, filter: Filter): void {
  if (searchRequest.filters) {
    searchRequest.filters.push(filter);
  } else {
    searchRequest.filters = [filter];
  }
}

const subexpressionPattern = /{{([^{}]+)}}/g;

/**
 * Parses an extended FHIR search criteria string (i.e. application/x-fhir-query), evaluating
 * any embedded FHIRPath subexpressions (e.g. `{{ %patient.id }}`) with the provided variables.
 *
 * @see https://hl7.org/fhir/fhir-xquery.html
 * @param query - The X-Fhir-Query string to parse
 * @param variables - Values to pass into embedded FHIRPath expressions
 * @returns The parsed search request
 */
export function parseXFhirQuery(query: string, variables: Record<string, TypedValue>): SearchRequest {
  query = query.replaceAll(subexpressionPattern, (_, expr) => {
    const replacement = evalFhirPathTyped(expr, [], variables);
    if (replacement.length !== 1) {
      return '';
    }
    return stringifyTypedValue(replacement[0]);
  });
  return parseCriteriaAsSearchRequest(query);
}

/**
 * Formats a search definition object into a query string.
 * Note: The return value does not include the resource type.
 * @param definition - The search definition.
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

  if (definition.include) {
    definition.include.forEach((target) => params.push(formatIncludeTarget('_include', target)));
  }

  if (definition.revInclude) {
    definition.revInclude.forEach((target) => params.push(formatIncludeTarget('_revinclude', target)));
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

function formatIncludeTarget(kind: '_include' | '_revinclude', target: IncludeTarget): string {
  return (
    kind + '=' + target.resourceType + ':' + target.searchParam + (target.targetType ? ':' + target.targetType : '')
  );
}

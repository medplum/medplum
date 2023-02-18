import { ResourceType } from '@medplum/fhirtypes';

export const DEFAULT_SEARCH_COUNT = 20;

export interface SearchRequest {
  readonly resourceType: ResourceType;
  filters?: Filter[];
  sortRules?: SortRule[];
  offset?: number;
  count?: number;
  fields?: string[];
  name?: string;
  total?: 'none' | 'estimate' | 'accurate';
  revInclude?: string;
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
}

const MODIFIER_OPERATORS: Operator[] = [
  Operator.CONTAINS,
  Operator.EXACT,
  Operator.TEXT,
  Operator.NOT,
  Operator.ABOVE,
  Operator.BELOW,
  Operator.IN,
  Operator.NOT_IN,
  Operator.OF_TYPE,
  Operator.MISSING,
];

const PREFIX_OPERATORS: Operator[] = [
  Operator.NOT_EQUALS,
  Operator.GREATER_THAN,
  Operator.LESS_THAN,
  Operator.GREATER_THAN_OR_EQUALS,
  Operator.LESS_THAN_OR_EQUALS,
  Operator.STARTS_AFTER,
  Operator.ENDS_BEFORE,
  Operator.APPROXIMATELY,
];

/**
 * Parses a URL into a SearchRequest.
 *
 * See the FHIR search spec: http://hl7.org/fhir/r4/search.html
 *
 * @param url The URL to parse.
 * @returns Parsed search definition.
 */
export function parseSearchDefinition(url: string): SearchRequest {
  const location = new URL(url, 'https://example.com/');
  const resourceType = location.pathname
    .replace(/(^\/)|(\/$)/g, '') // Remove leading and trailing slashes
    .split('/')
    .pop() as ResourceType;
  const params = new URLSearchParams(location.search);
  let filters: Filter[] | undefined = undefined;
  let sortRules: SortRule[] | undefined = undefined;
  let fields: string[] | undefined = undefined;
  let offset = undefined;
  let count = undefined;
  let total = undefined;

  params.forEach((value, key) => {
    if (key === '_fields') {
      fields = value.split(',');
    } else if (key === '_offset') {
      offset = parseInt(value);
    } else if (key === '_count') {
      count = parseInt(value);
    } else if (key === '_total') {
      total = value;
    } else if (key === '_sort') {
      sortRules = sortRules || [];
      sortRules.push(parseSortRule(value));
    } else {
      filters = filters || [];
      filters.push(parseSearchFilter(key, value));
    }
  });

  return {
    resourceType,
    filters,
    fields,
    offset,
    count,
    total,
    sortRules,
  };
}

/**
 * Parses a URL query parameter into a sort rule.
 *
 * By default, the sort rule is the field name.
 *
 * Sort rules can be reversed into descending order by prefixing the field name with a minus sign.
 *
 * See sorting: http://hl7.org/fhir/r4/search.html#_sort
 *
 * @param value The URL parameter value.
 * @returns The parsed sort rule.
 */
function parseSortRule(value: string): SortRule {
  if (value.startsWith('-')) {
    return { code: value.substring(1), descending: true };
  } else {
    return { code: value };
  }
}

/**
 * Parses a URL query parameter into a search filter.
 *
 * FHIR search filters can be specified as modifiers or prefixes.
 *
 * For string properties, modifiers are appended to the key, e.g. "name:contains=eve".
 *
 * For date and numeric properties, prefixes are prepended to the value, e.g. "birthdate=gt2000".
 *
 * See the FHIR search spec: http://hl7.org/fhir/r4/search.html
 *
 * @param key The URL parameter key.
 * @param value The URL parameter value.
 * @returns The parsed search filter.
 */
function parseSearchFilter(key: string, value: string): Filter {
  let code = key;
  let operator = Operator.EQUALS;

  for (const modifier of MODIFIER_OPERATORS) {
    const modifierIndex = code.indexOf(':' + modifier);
    if (modifierIndex !== -1) {
      operator = modifier;
      code = code.substring(0, modifierIndex);
    }
  }

  for (const prefix of PREFIX_OPERATORS) {
    if (value.match(new RegExp('^' + prefix + '\\d'))) {
      operator = prefix;
      value = value.substring(prefix.length);
    }
  }

  return { code, operator, value };
}

/**
 * Formats a search definition object into a query string.
 * Note: The return value does not include the resource type.
 * @param {!SearchRequest} definition The search definition.
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

  params.sort();
  return '?' + params.join('&');
}

function formatFilter(filter: Filter): string {
  const modifier = MODIFIER_OPERATORS.includes(filter.operator) ? ':' + filter.operator : '';
  const prefix = PREFIX_OPERATORS.includes(filter.operator) ? filter.operator : '';
  return `${filter.code}${modifier}=${prefix}${encodeURIComponent(filter.value)}`;
}

function formatSortRules(sortRules: SortRule[]): string {
  return '_sort=' + sortRules.map((sr) => (sr.descending ? '-' + sr.code : sr.code)).join(',');
}

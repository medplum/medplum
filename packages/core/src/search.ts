
export interface SearchRequest {
  readonly resourceType: string;
  readonly filters?: Filter[];
  readonly sortRules?: SortRule[];
  readonly page?: number;
  readonly count?: number;
  readonly fields?: string[];
  readonly name?: string;
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
  ABOVE = 'above',
  BELOW = 'below',
  IN = 'in',
  NOT_IN = 'not-in',
  OF_TYPE = 'of-type',
}


/**
 * Parses a URL into a SearchRequest.
 * @param location The URL to parse.
 * @returns Parsed search definition.
 */
export function parseSearchDefinition(location: { pathname: string, search?: string }): SearchRequest {
  const resourceType = location.pathname.split('/').pop() as string;
  const params = new URLSearchParams(location.search);
  const fields = ['id', 'meta.versionId', 'meta.lastUpdated', 'name'];
  const filters: Filter[] = [];
  const sortRules: SortRule[] = [];
  let page = 0;
  let count = 10;

  params.forEach((value, key) => {
    if (key === '_fields') {
      fields.length = 0;
      fields.push(...value.split(','));
      return;
    }
    if (key === '_sort') {
      if (value.startsWith('-')) {
        sortRules.push({ code: value.substr(1), descending: true });
      } else {
        sortRules.push({ code: value });
      }
    } else if (key === '_page') {
      page = parseInt(value);
    } else if (key === '_count') {
      count = parseInt(value);
    } else {
      filters.push({
        code: key,
        operator: Operator.EQUALS,
        value: value
      });
    }
  });

  return {
    resourceType,
    filters,
    fields,
    page,
    count,
    sortRules
  };
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
    definition.filters.forEach(filter => {
      params.push(filter.code + '=' + filter.value);
    });
  }

  if (definition.sortRules) {
    params.push(formatSortRules(definition.sortRules));
  }

  if (definition.page && definition.page > 0) {
    params.push('_page=' + definition.page);
  }

  if (definition.count && definition.count > 0) {
    params.push('_count=' + definition.count);
  }

  if (params.length === 0) {
    return '';
  }

  params.sort();
  return '?' + params.join('&');
}

function formatSortRules(sortRules: SortRule[] | undefined): string {
  if (!sortRules || sortRules.length === 0) {
    return '';
  }
  return '_sort=' + sortRules.map(sr => sr.descending ? '-' + sr.code : sr.code).join(',');
}

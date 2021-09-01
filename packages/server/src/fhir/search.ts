import { Bundle, BundleEntry, Filter, Operator, SearchParameter, SearchRequest, SortRule } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { URL } from 'url';

/**
 * Parses a FHIR search query.
 * See: https://www.hl7.org/fhir/search.html
 */

/**
 * For the ordered parameter types of number, date, and quantity,
 * a prefix to the parameter value may be used to control the nature
 * of the matching.
 * See: https://www.hl7.org/fhir/search.html#prefix
 */
const prefixMap: Record<string, Operator> = {
  'eq': Operator.EQUALS,
  'ne': Operator.NOT_EQUALS,
  'lt': Operator.LESS_THAN,
  'le': Operator.LESS_THAN_OR_EQUALS,
  'gt': Operator.GREATER_THAN,
  'ge': Operator.GREATER_THAN_OR_EQUALS,
  'sa': Operator.STARTS_AFTER,
  'eb': Operator.ENDS_BEFORE,
  'ap': Operator.APPROXIMATELY
};

/**
 * Parameter names may specify a modifier as a suffix.
 * The modifiers are separated from the parameter name by a colon.
 * See: https://www.hl7.org/fhir/search.html#modifiers
 */
const modifierMap: Record<string, Operator> = {
  'contains': Operator.CONTAINS,
  'exact': Operator.EXACT,
  'above': Operator.ABOVE,
  'below': Operator.BELOW,
  'text': Operator.TEXT,
  'not': Operator.NOT_EQUALS,
  'in': Operator.IN,
  'not-in': Operator.NOT_IN,
  'of-type': Operator.OF_TYPE
};

/**
 * The original search parameters bundle from the FHIR spec.
 */
const searchParams = readJson('fhir/r4/search-parameters.json') as Bundle;

/**
 * The pre-indexed search mappings.
 * @see buildMappings
 */
const searchMappings = buildMappings();

/**
 * Returns a search parameter lookup table indexed by resource type and search code.
 * The original FHIR spec includes all search parameter details,
 * but stored in a flat list in a bundle.
 * For runtime performance, we index by resource type and search code.
 * @returns Search parameter lookup table.
 */
function buildMappings(): Record<string, Record<string, SearchParameter>> {
  const mappings: Record<string, Record<string, SearchParameter>> = {};
  for (const entry of (searchParams.entry as BundleEntry[])) {
    const searchParam = entry.resource as SearchParameter;
    if (!searchParam.expression || !searchParam.code || !searchParam.base) {
      // Ignore special case search parameters
      // 'text' = 'Search on the narrative of the resource'
      // 'content' = 'Search on the entire content of the resource'
      // 'query' = 'A custom search profile that describes a specific defined query operation'
      continue;
    }

    const code = searchParam.code;
    for (const resourceType of searchParam.base) {
      mappings[resourceType] = mappings[resourceType] || {};
      mappings[resourceType][code] = searchParam;
    }
  }
  return mappings;
}

/**
 * Returns a collection of SearchParameters by resource type.
 * @param resourceType The FHIR resource type.
 * @returns The SearchParameters.
 */
export function getSearchParameters(resourceType: string): Record<string, SearchParameter> {
  return searchMappings[resourceType];
}

/**
 * Returns a SearchParameter by resource type and code.
 * @param resourceType The FHIR resource type.
 * @param code The search parameter code (i.e., the key in a query string parameter).
 * @returns The SearchParameter if found; otherwise undefined.
 */
export function getSearchParameter(resourceType: string, code: string): SearchParameter | undefined {
  return searchMappings[resourceType]?.[code];
}

/**
 * Parses a search URL into a search request.
 * @param resourceType The FHIR resource type.
 * @param query The collection of query string parameters.
 * @returns A parsed SearchRequest.
 */
export function parseSearchRequest(resourceType: string, query: Record<string, string | undefined>): SearchRequest {
  return new SearchParser(resourceType, query);
}

/**
 * Parses a search URL into a search request.
 * @param url The search URL.
 * @returns A parsed SearchRequest.
 */
export function parseSearchUrl(url: URL): SearchRequest {
  let resourceType = url.pathname;
  if (resourceType.startsWith('/')) {
    resourceType = resourceType.substring(1);
  }
  return new SearchParser(resourceType, Object.fromEntries(url.searchParams.entries()));
}

class SearchParser {
  readonly resourceType: string;
  readonly filters: Filter[];
  readonly sortRules: SortRule[];
  page: number;
  count: number;

  constructor(resourceType: string, query: Record<string, string | undefined>) {
    this.resourceType = resourceType;
    this.filters = [];
    this.sortRules = [];
    this.page = 0;
    this.count = 0;

    for (const [key, value] of Object.entries(query)) {
      this.parseKeyValue(key, value ?? '');
    }
  }

  private parseKeyValue(key: string, value: string) {
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
      case '_id':
      case 'id':
        this.filters.push({
          code: '_id',
          operator: Operator.EQUALS,
          value
        });
        break;

      case '_sort':
        this.parseSortRule(value);
        break;

      case '_page':
        this.page = parseInt(value);
        break;

      case '_count':
        this.count = parseInt(value);
        break;

      default:
        {
          const param = getSearchParameter(this.resourceType, code);
          if (param) {
            this.parseParameter(param, modifier, value);
          }
        }
    }
  }

  private parseSortRule(value: string) {
    for (const field of value.split(',')) {
      let code;
      let descending = false;
      if (field.startsWith('-')) {
        code = field.substring(1);
        descending = true;
      } else {
        code = field;
      }
      this.sortRules.push({ code, descending });
    }
  }

  private parseParameter(searchParam: SearchParameter, modifier: string, value: string) {
    switch (searchParam.type) {
      case 'number':
      case 'date':
        this.parsePrefixType(searchParam, value);
        break;
      case 'string':
      case 'token':
      case 'uri':
        this.parseModifierType(searchParam, modifier, value);
        break;
      case 'reference':
        this.parseReference(searchParam, value);
        break;
      case 'quantity':
        this.parseQuantity(searchParam, value);
        break;
    }
  }

  private parsePrefixType(param: SearchParameter, input: string) {
    const { operator, value } = parsePrefix(input);
    this.filters.push({
      code: param.code as string,
      operator,
      value
    });
  }

  private parseModifierType(param: SearchParameter, modifier: string, value: string) {
    this.filters.push({
      code: param.code as string,
      operator: parseModifier(modifier),
      value
    });
  }

  private parseReference(param: SearchParameter, value: string) {
    this.filters.push({
      code: param.code as string,
      operator: Operator.EQUALS,
      value: value
    });
  }

  private parseQuantity(param: SearchParameter, input: string) {
    const [prefixNumber, unitSystem, unitCode] = input.split('|');
    const { operator, value } = parsePrefix(prefixNumber);
    this.filters.push({
      code: param.code as string,
      operator,
      value,
      unitSystem,
      unitCode
    });
  }
}

function parsePrefix(input: string): { operator: Operator, value: string } {
  const prefix = input.substring(0, 2);
  if (prefix in prefixMap) {
    return { operator: prefixMap[prefix], value: input.substring(2) };
  }
  return { operator: Operator.EQUALS, value: input };
}

function parseModifier(modifier: string): Operator {
  return modifierMap[modifier] || Operator.EQUALS;
}

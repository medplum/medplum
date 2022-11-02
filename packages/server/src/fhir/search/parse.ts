import { badRequest, Filter, Operator, SearchRequest, SortRule } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';
import { URL } from 'url';
import { getSearchParameter } from '../structure';

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
 * Parameter names may specify a modifier as a suffix.
 * The modifiers are separated from the parameter name by a colon.
 * See: https://www.hl7.org/fhir/search.html#modifiers
 */
const modifierMap: Record<string, Operator> = {
  contains: Operator.CONTAINS,
  exact: Operator.EXACT,
  above: Operator.ABOVE,
  below: Operator.BELOW,
  text: Operator.TEXT,
  not: Operator.NOT_EQUALS,
  in: Operator.IN,
  'not-in': Operator.NOT_IN,
  'of-type': Operator.OF_TYPE,
};

/**
 * Parses a search URL into a search request.
 * @param resourceType The FHIR resource type.
 * @param query The collection of query string parameters.
 * @returns A parsed SearchRequest.
 */
export function parseSearchRequest(
  resourceType: string,
  query: Record<string, string[] | string | undefined>
): SearchRequest {
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

class SearchParser implements SearchRequest {
  readonly resourceType: string;
  readonly filters: Filter[];
  readonly sortRules: SortRule[];
  count?: number;
  offset?: number;
  total?: 'none' | 'estimate' | 'accurate';
  revInclude?: string;

  constructor(resourceType: string, query: Record<string, string[] | string | undefined>) {
    this.resourceType = resourceType;
    this.filters = [];
    this.sortRules = [];

    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        value.forEach((element) => this.#parseKeyValue(key, element));
      } else {
        this.#parseKeyValue(key, value ?? '');
      }
    }
  }

  #parseKeyValue(key: string, value: string): void {
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
          value,
        });
        break;

      case '_account':
      case '_compartment':
      case '_project':
        this.filters.push({
          code: code,
          operator: Operator.EQUALS,
          value,
        });
        break;

      case '_lastUpdated':
      case 'meta.lastUpdated':
        {
          const parsed = parsePrefix(value);
          this.filters.push({
            code: '_lastUpdated',
            ...parsed,
          });
        }
        break;

      case '_sort':
        this.#parseSortRule(value);
        break;

      case '_count':
        this.count = parseInt(value);
        break;

      case '_offset':
        this.offset = parseInt(value);
        break;

      case '_total':
        this.total = value as 'none' | 'estimate' | 'accurate';
        break;

      case '_summary':
        this.total = 'estimate';
        this.count = 0;
        break;

      case '_revinclude':
        this.revInclude = value;
        if (this.revInclude !== 'Provenance:target') {
          throw badRequest('Unsupported revinclude: ' + code);
        }
        break;

      default: {
        const param = getSearchParameter(this.resourceType, code);
        if (!param) {
          throw badRequest('Unknown search parameter: ' + code);
        }
        this.#parseParameter(param, modifier, value);
      }
    }
  }

  #parseSortRule(value: string): void {
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

  #parseParameter(searchParam: SearchParameter, modifier: string, value: string): void {
    if (modifier === 'missing') {
      this.filters.push({
        code: searchParam.code as string,
        operator: Operator.MISSING,
        value,
      });
      return;
    }
    switch (searchParam.type) {
      case 'number':
      case 'date':
        this.#parsePrefixType(searchParam, value);
        break;
      case 'string':
      case 'token':
      case 'uri':
        this.#parseModifierType(searchParam, modifier, value);
        break;
      case 'reference':
        this.#parseReference(searchParam, value);
        break;
      case 'quantity':
        this.#parseQuantity(searchParam, value);
        break;
    }
  }

  #parsePrefixType(param: SearchParameter, input: string): void {
    const { operator, value } = parsePrefix(input);
    this.filters.push({
      code: param.code as string,
      operator,
      value,
    });
  }

  #parseModifierType(param: SearchParameter, modifier: string, value: string): void {
    this.filters.push({
      code: param.code as string,
      operator: parseModifier(modifier),
      value,
    });
  }

  #parseReference(param: SearchParameter, value: string): void {
    this.filters.push({
      code: param.code as string,
      operator: Operator.EQUALS,
      value: value,
    });
  }

  #parseQuantity(param: SearchParameter, input: string): void {
    const [prefixNumber, unitSystem, unitCode] = input.split('|');
    const { operator, value } = parsePrefix(prefixNumber);
    this.filters.push({
      code: param.code as string,
      operator,
      value,
      unitSystem,
      unitCode,
    });
  }
}

function parsePrefix(input: string): { operator: Operator; value: string } {
  const prefix = input.substring(0, 2);
  if (prefix in prefixMap) {
    return { operator: prefixMap[prefix], value: input.substring(2) };
  }
  return { operator: Operator.EQUALS, value: input };
}

function parseModifier(modifier: string): Operator {
  return modifierMap[modifier] || Operator.EQUALS;
}

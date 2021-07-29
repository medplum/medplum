import { Bundle, BundleEntry, Filter, Operator, SearchParameter, SearchRequest, SortRule } from '@medplum/core';
import { readJson } from '@medplum/definitions';

/**
 * Parses a FHIR search query.
 * See: https://www.hl7.org/fhir/search.html
 */

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

export function parseSearchRequest(resourceType: string, query: Record<string, string | undefined>): SearchRequest {
  return new SearchParser(resourceType, query);
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
        this.parseNumber(searchParam, value);
        break;
      case 'date':
        this.parseDate(searchParam, value);
        break;
      case 'string':
        this.parseString(searchParam, modifier, value);
        break;
      case 'token':
        this.parseToken(searchParam, modifier, value);
        break;
      case 'reference':
        this.parseReference(searchParam, value);
        break;
      case 'composite':
        this.parseComposite(searchParam, value);
        break;
      case 'quantity':
        this.parseQuantity(searchParam, value);
        break;
      case 'uri':
        this.parseUri(searchParam, value);
        break;
      case 'special':
        this.parseSpecial(searchParam, value);
        break;
    }
  }

  private parseNumber(param: SearchParameter, value: string) {
    let op = Operator.EQUALS;
    let num = value;

    if (value.startsWith('eq')) {
      num = value.substring(2);

    } else if (value.startsWith('ne')) {
      op = Operator.NOT_EQUALS;
      num = value.substring(2);

    } else if (value.startsWith('lt')) {
      op = Operator.LESS_THAN;
      num = value.substring(2);

    } else if (value.startsWith('le')) {
      op = Operator.LESS_THAN_OR_EQUALS;
      num = value.substring(2);

    } else if (value.startsWith('gt')) {
      op = Operator.GREATER_THAN;
      num = value.substring(2);

    } else if (value.startsWith('ge')) {
      op = Operator.GREATER_THAN_OR_EQUALS;
      num = value.substring(2);
    }

    this.filters.push({
      // param,
      code: param.code as string,
      operator: op,
      value: num
    });
  }

  private parseDate(param: SearchParameter, value: string) {
    let op = Operator.EQUALS;
    let str = value;

    if (value.startsWith('eq')) {
      op = Operator.EQUALS;
      str = value.substring(2);

    } else if (value.startsWith('ne')) {
      op = Operator.NOT_EQUALS;
      str = value.substring(2);

    } else if (value.startsWith('lt')) {
      op = Operator.LESS_THAN;
      str = value.substring(2);

    } else if (value.startsWith('le')) {
      op = Operator.LESS_THAN_OR_EQUALS;
      str = value.substring(2);

    } else if (value.startsWith('gt')) {
      op = Operator.GREATER_THAN;
      str = value.substring(2);

    } else if (value.startsWith('ge')) {
      op = Operator.GREATER_THAN_OR_EQUALS;
      str = value.substring(2);

    } else if (value.startsWith('sa')) {
      op = Operator.STARTS_AFTER;
      str = value.substring(2);

    } else if (value.startsWith('eb')) {
      op = Operator.ENDS_BEFORE;
      str = value.substring(2);

    } else if (value.startsWith('ap')) {
      op = Operator.APPROXIMATELY;
      str = value.substring(2);
    }

    this.filters.push({
      code: param.code as string,
      operator: op,
      value: str
    });
  }

  private parseString(param: SearchParameter, modifier: string, value: string) {
    let op = Operator.EQUALS;

    if (modifier) {
      switch (modifier) {
        case 'contains':
          op = Operator.CONTAINS;
          break;

        case 'exact':
          op = Operator.EXACT;
          break;
      }
    }

    this.filters.push({
      // param,
      code: param.code as string,
      operator: op,
      value
    });
  }

  private parseToken(param: SearchParameter, modifier: string, value: string) {
    let op = Operator.EQUALS;

    if (modifier) {
      switch (modifier) {
        case 'text':
          op = Operator.TEXT;
          break;

        case 'not':
          op = Operator.NOT_EQUALS;
          break;

        case 'above':
          op = Operator.ABOVE;
          break;

        case 'below':
          op = Operator.BELOW;
          break;

        case 'in':
          op = Operator.IN;
          break;

        case 'not-in':
          op = Operator.NOT_IN;
          break;

        case 'of-type':
          op = Operator.OF_TYPE;
          break;
      }
    }

    this.filters.push({
      code: param.code as string,
      operator: op,
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

  private parseComposite(param: SearchParameter, value: string) {
    // TODO
  }

  private parseQuantity(param: SearchParameter, value: string) {
    // TODO
  }

  private parseUri(param: SearchParameter, value: string) {
    // TODO
  }

  private parseSpecial(param: SearchParameter, value: string) {
    // TODO
  }
}

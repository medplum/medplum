import {
  badRequest,
  Operator as FhirOperator,
  Filter,
  OperationOutcomeError,
  SortRule,
  splitN,
  splitSearchOnComma,
} from '@medplum/core';
import { Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { getSearchParameterImplementation, TokenColumnSearchParameterImplementation } from './searchparameter';
import { Column, Conjunction, Disjunction, Expression, Negation, SelectQuery, TypedCondition } from './sql';
import { buildTokensForSearchParameter, shouldTokenExistForMissingOrPresent, Token } from './tokens';

const DELIM = '\x01';
const NULL_SYSTEM = '\x02';
const ARRAY_DELIM = '\x03'; // If `ARRAY_DELIM` changes, the `token_array_to_text` function will be outdated.

export function buildTokenColumns(
  searchParam: SearchParameter,
  impl: TokenColumnSearchParameterImplementation,
  columns: Record<string, any>,
  resource: Resource
): void {
  const allTokens: Token[] = [];
  buildTokensForSearchParameter(allTokens, resource, searchParam);

  // search parameters may share columns, so add any existing tokens to the set
  const tokens = new Set<string>(columns[impl.tokenColumnName]);
  const textSearchTokens = new Set<string>(columns[impl.textSearchColumnName]);

  const legacyTokens = new Set<string>(columns[impl.legacyColumnName]);
  const legacyTextSearchTokens = new Set<string>(columns[impl.legacyTextSearchColumnName]);

  let sortColumnValue: string | null = null;
  for (const t of allTokens) {
    const code = t.code;
    const system = t.system?.trim?.();
    let value = t.value?.trim?.();
    if (!code || (!system && !value)) {
      continue;
    }

    if (value && impl.caseInsensitive) {
      value = value.toLocaleLowerCase();
    }

    // sanity check
    if (code !== searchParam.code) {
      throw new Error(`Invalid token code ${code} for search parameter with code ${searchParam.code}`);
    }

    // :missing/:present - in a token column per search parameter, the presence of any elements
    // in the main token column, `impl.tokenColumnName`, is sufficient.
    legacyTokens.add(code);

    if (system) {
      // [parameter]=[system]|
      legacyTokens.add(code + DELIM + system);
      tokens.add(system);

      if (value) {
        // [parameter]=[system]|[code]
        legacyTokens.add(code + DELIM + system + DELIM + value);
        tokens.add(system + DELIM + value);
      }
    }

    if (value) {
      sortColumnValue = sortColumnValue && sortColumnValue.localeCompare(value) <= 0 ? sortColumnValue : value;

      // [parameter]=[code]
      legacyTokens.add(code + DELIM + DELIM + value);
      tokens.add(DELIM + value);

      if (!system) {
        // [parameter]=|[code]
        legacyTokens.add(code + DELIM + NULL_SYSTEM + DELIM + value);
        tokens.add(NULL_SYSTEM + DELIM + value);
      }

      // text search
      if (system === 'text' || impl.textSearch) {
        legacyTextSearchTokens.add(code + DELIM + DELIM + value);
        textSearchTokens.add(value);
      }
    }
  }

  columns[impl.tokenColumnName] = Array.from(tokens);
  columns[impl.textSearchColumnName] = Array.from(textSearchTokens);
  columns[impl.sortColumnName] = sortColumnValue;
  columns[impl.legacyColumnName] = Array.from(legacyTokens);
  columns[impl.legacyTextSearchColumnName] = Array.from(legacyTextSearchTokens);
}

/**
 * Adds "order by" clause to the select query builder.
 * @param selectQuery - The select query builder.
 * @param resourceType - The resource type.
 * @param sortRule - The sort rule details.
 * @param param - The search parameter.
 */
export function addTokenColumnsOrderBy(
  selectQuery: SelectQuery,
  resourceType: ResourceType,
  sortRule: SortRule,
  param: SearchParameter
): void {
  /*
    [R4 spec behavior](https://www.hl7.org/fhir/r4/search.html#_sort):
    A search parameter can refer to an element that repeats, and therefore there can be
    multiple values for a given search parameter for a single resource. In this case,
    the sort is based on the item in the set of multiple parameters that comes earliest in
    the specified sort order when ordering the returned resources.

    In [R5](https://www.hl7.org/fhir/r5/search.html#_sort) and beyond, that language is replaced with:
    Servers have discretion on the implementation of sorting for both repeated elements and complex
    elements. For example, if requesting a sort on Patient.name, servers might search by family name
    then given, given name then family, or prefix, family, and then given. Similarly, when sorting with
    multiple given names, the sort might be based on the 'earliest' name in sort order or the first name
    in the instance.

    Current behavior:
    Sorts by the alphabetically first value found in the token array. This can result
    in possibly unexpected/surprising result ordering when a resource has multiple token
    values for the same code.

    To avoid the surprising behavior, we could store both the alphabetically first and last
    values for each search parameter.
  */
  const impl = getSearchParameterImplementation(resourceType, param);
  if (impl.searchStrategy !== 'token-column') {
    throw new Error('Invalid search strategy: ' + impl.searchStrategy);
  }

  selectQuery.orderBy(new Column(undefined, impl.sortColumnName), sortRule.descending);
}

export function buildTokenColumnsSearchFilter(
  resourceType: ResourceType,
  tableName: string,
  param: SearchParameter,
  filter: Filter,
  strategy: 'unified-tokens-column' | 'column-per-code'
): Expression {
  const impl = getSearchParameterImplementation(resourceType, param);
  if (impl.searchStrategy !== 'token-column') {
    throw new Error('Invalid search strategy: ' + impl.searchStrategy);
  }

  switch (filter.operator) {
    case FhirOperator.TEXT:
    case FhirOperator.CONTAINS:
    case FhirOperator.EQUALS:
    case FhirOperator.EXACT:
    case FhirOperator.NOT:
    case FhirOperator.NOT_EQUALS: {
      filter.operator satisfies TokenQueryOperator;

      // https://www.hl7.org/fhir/r4/search.html#combining
      const expressions: Expression[] = [];
      for (const searchValue of splitSearchOnComma(filter.value)) {
        if (strategy === 'unified-tokens-column') {
          expressions.push(
            buildTokenColumnsWhereConditionOneColumn(impl, tableName, filter.code, filter.operator, searchValue)
          );
        } else {
          expressions.push(buildTokenColumnsWhereCondition(impl, tableName, filter.code, filter.operator, searchValue));
        }
      }

      const expression = new Disjunction(expressions);
      if (filter.operator === FhirOperator.NOT || filter.operator === FhirOperator.NOT_EQUALS) {
        return new Negation(expression);
      }
      return expression;
    }
    case FhirOperator.MISSING:
    case FhirOperator.PRESENT: {
      if (strategy === 'unified-tokens-column') {
        const cond = new TypedCondition(
          new Column(tableName, impl.legacyColumnName),
          'ARRAY_CONTAINS',
          filter.code,
          'TEXT[]'
        );
        if (!shouldTokenExistForMissingOrPresent(filter.operator, filter.value)) {
          return new Negation(cond);
        }
        return cond;
      }

      if (shouldTokenExistForMissingOrPresent(filter.operator, filter.value)) {
        return new TypedCondition(new Column(tableName, impl.tokenColumnName), 'ARRAY_NOT_EMPTY', undefined, 'TEXT[]');
      } else {
        return new TypedCondition(new Column(tableName, impl.tokenColumnName), 'ARRAY_EMPTY', undefined, 'TEXT[]');
      }
    }
    case FhirOperator.IN:
    case FhirOperator.NOT_IN:
    case FhirOperator.STARTS_WITH:
    case FhirOperator.GREATER_THAN:
    case FhirOperator.LESS_THAN:
    case FhirOperator.GREATER_THAN_OR_EQUALS:
    case FhirOperator.LESS_THAN_OR_EQUALS:
    case FhirOperator.STARTS_AFTER:
    case FhirOperator.ENDS_BEFORE:
    case FhirOperator.APPROXIMATELY:
    case FhirOperator.IDENTIFIER:
    case FhirOperator.ITERATE:
    case FhirOperator.ABOVE:
    case FhirOperator.BELOW:
    case FhirOperator.OF_TYPE:
      throw new OperationOutcomeError(
        badRequest(`Search filter '${filter.operator}' not supported for ${param.id ?? param.code}`)
      );
    default: {
      filter.operator satisfies never;
      throw new OperationOutcomeError(
        badRequest(`Search filter '${filter.operator}' not supported for ${param.id ?? param.code}`)
      );
    }
  }
}

export const TokenQueryOperators = [
  FhirOperator.TEXT,
  FhirOperator.CONTAINS,
  FhirOperator.EQUALS,
  FhirOperator.EXACT,
  FhirOperator.NOT,
  FhirOperator.NOT_EQUALS,
] as const;

type TokenQueryOperator = (typeof TokenQueryOperators)[number];

/**
 * Build a filter for each comma-separated query value. Negation should NOT be handled here;
 * the calling function is responsible for negating the disjunction of the expressions returned
 * by this function.
 * @param impl - The search parameter implementation.
 * @param tableName - The table name.
 * @param code - The search parameter code.
 * @param operator - The search operator.
 * @param query - The query value.
 * @returns The filter expression for the search parameter without negation.
 */
function buildTokenColumnsWhereCondition(
  impl: TokenColumnSearchParameterImplementation,
  tableName: string,
  code: string,
  operator: TokenQueryOperator,
  query: string
): Expression {
  query = query.trim();

  switch (operator) {
    case FhirOperator.TEXT:
    case FhirOperator.CONTAINS: {
      // perform a regex search on the string generated by the token_array_to_text function
      // the array entries are of the form `value` and are joined by ARRAY_DELIM
      // as well as having an ARRAY_DELIM prefix and suffix on the entire string:
      // Overall, the string being searched by regex is of the form:
      // ARRAY_DELIM + <value1> + ARRAY_DELIM + <value2> + ... + ARRAY_DELIM

      // this regex looks for an entry from the format described above:
      //   - `ARRAY_DELIM`
      //   - any number of characters that are not `ARRAY_DELIM` (to support infix search)
      //   - the query string
      const regexStr = ARRAY_DELIM + '[^' + ARRAY_DELIM + ']*' + escapeRegexString(query);
      const textSearchCol = new Column(tableName, impl.textSearchColumnName);
      const regexCond = new TypedCondition(textSearchCol, 'TOKEN_ARRAY_IREGEX', regexStr, 'TEXT[]');

      // For :text (but not :contains), also check that the token column contains `'text'`,
      // where 'text' is the system value specified for token values that should be text-searchable
      if (operator === FhirOperator.TEXT) {
        const systemCol = new Column(tableName, impl.tokenColumnName);
        return new Conjunction([regexCond, new TypedCondition(systemCol, 'ARRAY_CONTAINS', 'text', 'TEXT[]')]);
      }

      return regexCond;
    }
    case FhirOperator.EQUALS:
    case FhirOperator.EXACT:
    case FhirOperator.NOT:
    case FhirOperator.NOT_EQUALS: {
      /*
      exact matches on the formats:
        <system>|
        <system>|<value>
        |<value>
        <value>
      */

      let system: string;
      let value: string;
      let columnName: string;
      const parts = splitN(query, '|', 2);
      if (parts.length === 2) {
        system = parts[0] || NULL_SYSTEM; // If query is "|foo", searching for "foo" values without a system, aka NULL_SYSTEM
        value = parts[1];
        if (value) {
          value = impl.caseInsensitive ? value.toLocaleLowerCase() : value;
          return new TypedCondition(
            new Column(tableName, impl.tokenColumnName),
            'ARRAY_CONTAINS',
            system + DELIM + value,
            'TEXT[]'
          );
        } else {
          return new TypedCondition(new Column(tableName, impl.tokenColumnName), 'ARRAY_CONTAINS', system, 'TEXT[]');
        }
      } else {
        value = query;
        columnName = impl.tokenColumnName;
        value = impl.caseInsensitive ? value.toLocaleLowerCase() : value;
        return new TypedCondition(new Column(tableName, columnName), 'ARRAY_CONTAINS', DELIM + value, 'TEXT[]');
      }
    }
    default: {
      operator satisfies never;
      throw new OperationOutcomeError(badRequest(`Unexpected search operator '${operator}'`));
    }
  }
}

/**
 * Build a filter for each comma-separated query value. Negation should NOT be handled here;
 * the calling function is responsible for negating the disjunction of the expressions returned
 * by this function.
 * @param impl - The search parameter implementation.
 * @param tableName - The table name.
 * @param code - The search parameter code.
 * @param operator - The search operator.
 * @param query - The query value.
 * @returns The filter expression for the search parameter without negation.
 */
function buildTokenColumnsWhereConditionOneColumn(
  impl: TokenColumnSearchParameterImplementation,
  tableName: string,
  code: string,
  operator: TokenQueryOperator,
  query: string
): Expression {
  query = query.trim();
  const tokenCol = new Column(tableName, impl.legacyColumnName);
  const textSearchCol = new Column(tableName, impl.legacyTextSearchColumnName);

  switch (operator) {
    case FhirOperator.TEXT:
    case FhirOperator.CONTAINS: {
      // perform a regex search on the string generated by the token_array_to_text function
      // the array entries are of the form `code + DELIM + DELIM + value` and are joined by ARRAY_DELIM
      // as well as having an ARRAY_DELIM prefix and suffix on the entire string:
      // Overall, the string being searched by regex is of the form:
      // ARRAY_DELIM + <code1> + DELIM + DELIM + <value1> + ARRAY_DELIM + <code2> + DELIM + DELIM + <value2> + ARRAY_DELIM

      // this regex looks for an entry from the format described above:
      // `ARRAY_DELIM + <code> + DELIM + DELIM` followed by any number of characters that are not `ARRAY_DELIM`
      // and then the query string
      const regexStr = ARRAY_DELIM + code + DELIM + DELIM + '[^' + ARRAY_DELIM + ']*' + escapeRegexString(query);
      const regexCond = new TypedCondition(textSearchCol, 'TOKEN_ARRAY_IREGEX', regexStr, 'TEXT[]');

      // For :text (but not :contains), also check that the token column contains `<code> + DELIM + 'text'`,
      // where 'text' is the system value specified for token values that should be text-searchable
      if (operator === FhirOperator.TEXT) {
        return new Conjunction([
          regexCond,
          new TypedCondition(tokenCol, 'ARRAY_CONTAINS', code + DELIM + 'text', 'TEXT[]'),
        ]);
      }

      return regexCond;
    }
    case FhirOperator.EQUALS:
    case FhirOperator.EXACT:
    case FhirOperator.NOT:
    case FhirOperator.NOT_EQUALS: {
      // exact matches on the formats <value>,<system>|<value>,<system>|,|<value>

      let system: string;
      let value: string;
      const parts = splitN(query, '|', 2);
      if (parts.length === 2) {
        system = parts[0] || NULL_SYSTEM; // If query is "|foo", searching for "foo" values without a system, aka NULL_SYSTEM
        value = parts[1];
      } else {
        system = '';
        value = query;
      }

      if (value && impl.caseInsensitive) {
        value = value.toLocaleLowerCase();
      }

      const valuePart = value ? DELIM + value : '';

      // Always start with code + DELIM + system (system may be empty string which is okay/expected)
      // if a value is specified, add DELIM + value resulting in code + DELIM + system + DELIM + value
      // if a value is not specified, result is code + DELIM + system
      return new TypedCondition(tokenCol, 'ARRAY_CONTAINS', code + DELIM + system + valuePart, 'TEXT[]');
    }
    default: {
      operator satisfies never;
      throw new OperationOutcomeError(badRequest(`Unexpected search operator '${operator}'`));
    }
  }
}

export function escapeRegexString(str: string): string {
  // Escape the following special regex characters:
  // . - matches any single character except newline
  // ^ - matches the start of a string
  // $ - matches the end of a string
  // * - matches 0 or more of the preceding character
  // + - matches 1 or more of the preceding character
  // ? - matches 0 or 1 of the preceding character
  // ( ) - define capturing groups
  // [ ] - define character classes
  // { } - define quantifiers
  // \ - escapes a special character
  // | - alternation (OR operator)
  return str.replace(/[.^$*+?()[\]{}\\|]/g, '\\$&');
}

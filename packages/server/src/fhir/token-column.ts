import { Operator as FhirOperator, Filter, SortRule, splitN, splitSearchOnComma } from '@medplum/core';
import { Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { escapeLiteral } from 'pg';
import { shouldTokenRowExist } from './lookups/token';
import { getSearchParameterImplementation, TokenColumnSearchParameterImplementation } from './searchparameter';
import {
  Column,
  Condition,
  Conjunction,
  Disjunction,
  escapeLikeString,
  Expression,
  Negation,
  SelectQuery,
  SqlFunctions,
  TypedCondition,
} from './sql';
import { buildTokensForSearchParameter, isCaseSensitiveSearchParameter, Token } from './tokens';

const DELIM = '\x01';
const NULL_SYSTEM = '\x02';
const ARRAY_DELIM = '\x03';

export const TokenSpecialCharacters = {
  DELIM,
  NULL_SYSTEM,
  ARRAY_DELIM,
};

export function buildTokenColumns(
  searchParam: SearchParameter,
  impl: TokenColumnSearchParameterImplementation,
  columns: Record<string, any>,
  resource: Resource
): void {
  // TODO [Search by logical references](https://github.com/medplum/medplum/issues/1630) needs
  // to be addressed again. Hmm...

  const allTokens: Token[] = [];
  buildTokensForSearchParameter(allTokens, resource, searchParam);

  const tokens = new Set<string>(columns[impl.columnName]);
  for (const t of allTokens) {
    const code = t.code;

    const system = t.system?.trim?.();
    const value = t.value?.trim?.();
    if (!code || (!system && !value)) {
      continue;
    }

    // sanity check
    if (code !== searchParam.code) {
      throw new Error(`Invalid token code ${code} for search parameter with code ${searchParam.code}`);
    }

    // MISSING/PRESENT - any entries in the column at all

    const tokenSet = tokens;
    if (system) {
      // [parameter]=[system]|
      tokenSet.add(code + DELIM + system);

      if (value) {
        // [parameter]=[system]|[code]
        tokenSet.add(code + DELIM + system + DELIM + value);
      }
    }

    if (value) {
      // [parameter]=[code]
      tokenSet.add(code + DELIM + DELIM + value);

      if (!system) {
        // [parameter]=|[code]
        tokenSet.add(code + DELIM + NULL_SYSTEM + DELIM + value);
      }
    }
  }
  columns[impl.columnName] = Array.from(tokens);
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
    Sorts by the first value found in the token array for the given sort code which can result
    in incorrect result ordering when a resource has multiple token values for the same code.

    To achieve the correct behavior, it would be "best" to precompute and store in additional columns,
    e.g. "codeAsc" and "codeDesc" for each token column in the token table. Writes are a little slower,
    but searching would be quick.
  */
  const impl = getSearchParameterImplementation(resourceType, param);
  if (impl.searchStrategy !== 'token-column') {
    throw new Error('Invalid search strategy: ' + impl.searchStrategy);
  }

  selectQuery.orderBy(
    new Column(
      undefined,
      `substring(${SqlFunctions.token_array_to_text.name}("${impl.columnName}"),` +
        escapeLiteral(ARRAY_DELIM + param.code + DELIM + DELIM + '([^' + ARRAY_DELIM + ']+)') +
        ')',
      true
    ),
    sortRule.descending
  );
}

export function buildTokenColumnsSearchFilter(
  resourceType: ResourceType,
  tableName: string,
  param: SearchParameter,
  filter: Filter
): Expression {
  const caseSensitive = isCaseSensitiveSearchParameter(param, resourceType);
  const impl = getSearchParameterImplementation(resourceType, param);
  if (impl.searchStrategy !== 'token-column') {
    throw new Error('Invalid search strategy: ' + impl.searchStrategy);
  }

  const valueExpressions = [];

  // https://www.hl7.org/fhir/r4/search.html#combining
  for (const option of splitSearchOnComma(filter.value)) {
    const expression = buildTokenColumnsWhereCondition(impl, tableName, filter, caseSensitive, option);
    if (expression) {
      valueExpressions.push(expression);
    }
  }

  if (valueExpressions.length > 0) {
    const expression = new Disjunction(valueExpressions);
    if (!shouldTokenRowExist(filter)) {
      return new Negation(expression);
    }
    return expression;
  }

  // missing/present
  if (shouldTokenRowExist(filter)) {
    return new TypedCondition(new Column(tableName, impl.columnName), 'ARRAY_NOT_EMPTY', undefined);
  } else {
    return new TypedCondition(new Column(tableName, impl.columnName), 'ARRAY_EMPTY', undefined);
  }
}

function buildTokenColumnsWhereCondition(
  impl: TokenColumnSearchParameterImplementation,
  tableName: string,
  filter: Filter,
  caseSensitive: boolean,
  query: string
): Expression | undefined {
  const code = filter.code;
  query = query.trim();
  const tokenCol = new Column(tableName, impl.columnName);

  switch (filter.operator) {
    case FhirOperator.NOT_IN:
    case FhirOperator.IN: {
      // If using the :in operator, build the condition for joining to the ValueSet table specified by `query`
      const cond = buildInValueSetCondition(code, impl, tableName, query);
      if (filter.operator === FhirOperator.NOT_IN) {
        return new Negation(cond);
      }
      return cond;
    }
    case FhirOperator.MISSING:
    case FhirOperator.PRESENT:
    case FhirOperator.IDENTIFIER:
      // We are just looking for the presence / absence of a token (e.g. when using the FhirOperator.MISSING)
      // TODO{mattlong} base on the operators that return false in shouldCompareTokenValue
      return undefined;
    case FhirOperator.TEXT: {
      // token_array_to_text(token) ~ '\x3text\x1[^\x3]*Quick Brown'
      const regexStr =
        ARRAY_DELIM + code + DELIM + 'text' + DELIM + '[^' + ARRAY_DELIM + ']*' + escapeRegexString(query);
      return new Conjunction([
        new TypedCondition(tokenCol, 'ARRAY_CONTAINS', code + DELIM + 'text', 'TEXT[]'),
        new TypedCondition(tokenCol, 'ARRAY_IREGEX', regexStr, 'TEXT[]'),
      ]);
    }
    case FhirOperator.CONTAINS: {
      const likeStr = '%' + ARRAY_DELIM + code + DELIM + DELIM + '%' + escapeLikeString(query) + '%';
      const regexStr = ARRAY_DELIM + code + DELIM + DELIM + '[^' + ARRAY_DELIM + ']*' + escapeRegexString(query);

      return new Conjunction([
        // This ILIKE doesn't guarantee a matching row, but including it can result faster query
        // since a trigram index is faster at LIKE/ILIKE than regex. In other words, the LIKE is a low-pass filter
        new TypedCondition(tokenCol, 'ARRAY_ILIKE', likeStr, 'TEXT[]'),
        new TypedCondition(tokenCol, 'ARRAY_IREGEX', regexStr, 'TEXT[]'),
      ]);
    }
    default: {
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

      const valuePart = value ? DELIM + value : '';

      if (caseSensitive) {
        return new TypedCondition(tokenCol, 'ARRAY_CONTAINS', code + DELIM + system + valuePart, 'TEXT[]');
      } else {
        const regexStr = code + DELIM + system + DELIM + escapeRegexString(value) + ARRAY_DELIM;
        return new TypedCondition(tokenCol, 'ARRAY_IREGEX', regexStr, 'TEXT[]');
      }
    }
  }
}

function buildInValueSetCondition(
  code: string,
  impl: TokenColumnSearchParameterImplementation,
  tableName: string,
  query: string
): Condition {
  const valueSetQ = new SelectQuery('ValueSet').raw('unnest(reference) as reference').where('url', '=', query).limit(1);
  const withCodeQ = new SelectQuery('withCode', valueSetQ).raw(`e'${code + DELIM}' || reference as code_and_url`);
  const aggregatedQ = new SelectQuery('aggregated', withCodeQ).raw('array_agg(code_and_url) as code_and_urls');
  const cond = new TypedCondition(
    new Column(tableName, impl.columnName),
    'ARRAY_CONTAINS_SUBQUERY',
    aggregatedQ,
    'TEXT[]'
  );

  return cond;
}

export function escapeRegexString(str: string): string {
  // TODO: Implement
  return str;
}

import {
  Operator as FhirOperator,
  Filter,
  getSearchParameterDetails,
  SearchParameterDetails,
  SortRule,
  splitN,
  splitSearchOnComma,
} from '@medplum/core';
import { escapeLiteral } from 'pg';
import {
  Column,
  Conjunction,
  Disjunction,
  escapeLikeString,
  Expression,
  Negation,
  SelectQuery,
  TypedCondition,
} from './sql';
import { isCaseSensitiveSearchParameter, shouldCompareTokenValue, shouldTokenRowExist } from './lookups/token';
import { ResourceType, SearchParameter } from '@medplum/fhirtypes';

const DELIM = '\x01';
const NULL_SYSTEM = '\x02';
const ARRAY_DELIM = '\x03';

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
  const details = getSearchParameterDetails(resourceType, param);
  selectQuery.orderBy(
    new Column(
      undefined,
      `substring(a2t("${details.columnName}"),` +
        escapeLiteral(ARRAY_DELIM + DELIM + '([^' + ARRAY_DELIM + ']+)') +
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
  const details = getSearchParameterDetails(resourceType, param);

  const valueExpressions = [];

  // https://www.hl7.org/fhir/r4/search.html#combining
  for (const option of splitSearchOnComma(filter.value)) {
    const expression = buildTokenColumnsWhereCondition(param, details, tableName, filter, caseSensitive, option);
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
    return new TypedCondition(new Column(tableName, details.columnName), 'ARRAY_NOT_EMPTY', undefined);
  } else {
    return new TypedCondition(new Column(tableName, details.columnName), 'ARRAY_EMPTY', undefined);
  }
}

function buildTokenColumnsWhereCondition(
  param: SearchParameter,
  details: SearchParameterDetails,
  tableName: string,
  filter: Filter,
  caseSensitive: boolean,
  query: string
): Expression | undefined {
  query = query.trim();

  // If using the :in operator, build the condition for joining to the ValueSet table specified by `query`
  if (filter.operator === FhirOperator.IN) {
    const valueSetQ = new SelectQuery('ValueSet').column('reference').where('url', '=', query).limit(1);
    return new TypedCondition(
      new Column(tableName, details.columnName),
      'ARRAY_CONTAINS_SUBQUERY',
      valueSetQ,
      'TEXT[]'
    );
  }

  // We are just looking for the presence / absence of a token (e.g. when using the FhirOperator.MISSING)
  if (!shouldCompareTokenValue(filter.operator)) {
    return undefined;
  }

  const tokenCol = new Column(tableName, details.columnName);

  if (filter.operator === FhirOperator.TEXT) {
    // a2t(token) ~ '\x3text\x1[^\x3]*Quick Brown'
    const regexStr = ARRAY_DELIM + 'text' + DELIM + '[^' + ARRAY_DELIM + ']*' + escapeRegexString(query);
    return new Conjunction([
      new TypedCondition(tokenCol, 'ARRAY_CONTAINS', 'text', 'TEXT[]'),
      new TypedCondition(tokenCol, 'ARRAY_IREGEX', regexStr, 'TEXT[]'),
    ]);
  } else if (filter.operator === FhirOperator.CONTAINS) {
    const likeStr = '%' + ARRAY_DELIM + DELIM + '%' + escapeLikeString(query) + '%';
    const regexStr = ARRAY_DELIM + DELIM + '[^' + ARRAY_DELIM + ']*' + escapeRegexString(query);

    return new Conjunction([
      // This ILIKE doesn't guarantee a matching row, but including it can result faster query
      // since a trigram index is faster at LIKE/ILIKE than regex. In other words, the LIKE is a low-pass filter
      new TypedCondition(tokenCol, 'ARRAY_ILIKE', likeStr, 'TEXT[]'),
      new TypedCondition(tokenCol, 'ARRAY_IREGEX', regexStr, 'TEXT[]'),
    ]);
  }

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
    return new TypedCondition(tokenCol, 'ARRAY_CONTAINS', system + valuePart, 'TEXT[]');
  } else {
    const regexStr = system + DELIM + escapeRegexString(value) + ARRAY_DELIM;
    return new TypedCondition(tokenCol, 'ARRAY_IREGEX', regexStr, 'TEXT[]');
  }
}

export function escapeRegexString(str: string): string {
  // TODO: Implement
  return str;
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter, SortRule } from '@medplum/core';
import {
  Operator as FhirOperator,
  invalidSearchOperator,
  OperationOutcomeError,
  splitN,
  splitSearchOnComma,
} from '@medplum/core';
import type { Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { NIL, v5 } from 'uuid';
import type { ArrayColumnPaddingConfig } from '../config/types';
import type { TokenColumnSearchParameterImplementation } from './searchparameter';
import { getSearchParameterImplementation } from './searchparameter';
import type { Expression, SelectQuery } from './sql';
import { Column, Condition, Disjunction, Negation, truncateTextColumn, TypedCondition } from './sql';
import type { Token } from './tokens';
import { buildTokensForSearchParameter, shouldTokenExistForMissingOrPresent } from './tokens';

const DELIM = '\x01';
const NULL_SYSTEM = '\x02';
const ARRAY_DELIM = '\x03'; // If `ARRAY_DELIM` changes, the `token_array_to_text` function will be outdated.
const TEXT_SEARCH_SYSTEM = '\x04';

export function buildTokenColumns(
  searchParam: SearchParameter,
  impl: TokenColumnSearchParameterImplementation,
  columns: Record<string, any>,
  resource: Resource,
  options?: {
    paddingConfig?: ArrayColumnPaddingConfig;
  }
): void {
  const allTokens: Token[] = [];
  buildTokensForSearchParameter(allTokens, resource, searchParam, TEXT_SEARCH_SYSTEM);

  // search parameters may share columns, so add any existing tokens to the set
  const tokens = new Set<string>(columns[impl.tokenColumnName]);
  const textSearchTokens = new Set<string>(columns[impl.textSearchColumnName]);

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

    // text search
    if (value && (system === TEXT_SEARCH_SYSTEM || impl.textSearch)) {
      if (impl.hasDedicatedColumns) {
        textSearchTokens.add(value);
      } else {
        textSearchTokens.add(code + DELIM + value);
      }

      /*
      Ideally we could continue here when system === TEXT_SEARCH_SYSTEM, but right now Medplum supports exact searches on the text content
      as if it were a normal token value, e.g. the following resource should match the search `Task?code=cursor_test` 

      {
        resourceType: 'Task',
        status: 'accepted',
        intent: 'order',
        code: { text: 'cursor_test' },
      }
      */
    }

    // :missing/:present - in a token column per search parameter, the presence of any elements
    // in the main token column, `impl.tokenColumnName`, is sufficient.
    if (!impl.hasDedicatedColumns) {
      addHashedToken(tokens, code);
    }

    const prefix = impl.hasDedicatedColumns ? '' : code + DELIM;

    // The TEXT_SEARCH_SYSTEM is never searchable
    if (system && system !== TEXT_SEARCH_SYSTEM) {
      // [parameter]=[system]|
      addHashedToken(tokens, prefix + system);

      if (value) {
        // [parameter]=[system]|[code]
        addHashedToken(tokens, prefix + system + DELIM + value);
      }
    }

    if (value) {
      sortColumnValue = sortColumnValue && sortColumnValue.localeCompare(value) <= 0 ? sortColumnValue : value;

      // [parameter]=[code]
      addHashedToken(tokens, prefix + DELIM + value);

      if (!system) {
        // [parameter]=|[code]
        addHashedToken(tokens, prefix + NULL_SYSTEM + DELIM + value);
      }
    }
  }

  if (options?.paddingConfig) {
    const paddingElement = getPaddingElement(options.paddingConfig);
    if (paddingElement) {
      tokens.add(paddingElement);
    }
  }

  columns[impl.tokenColumnName] = Array.from(tokens);
  columns[impl.textSearchColumnName] = Array.from(textSearchTokens);
  columns[impl.sortColumnName] = truncateTextColumn(sortColumnValue);
}

function addHashedToken(tokenSet: Set<string>, token: string): void {
  tokenSet.add(hashTokenColumnValue(token));
}

export function hashTokenColumnValue(value: string): string {
  return v5(value, NIL);
}

/**
 * Adds "order by" clause to the select query builder.
 * @param selectQuery - The select query builder.
 * @param impl - The search parameter implementation.
 * @param sortRule - The sort rule details.
 */
export function addTokenColumnsOrderBy(
  selectQuery: SelectQuery,
  impl: TokenColumnSearchParameterImplementation,
  sortRule: SortRule
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
  selectQuery.orderBy(new Column(undefined, impl.sortColumnName), sortRule.descending);
}

export function buildTokenColumnsSearchFilter(
  resourceType: ResourceType,
  tableName: string,
  param: SearchParameter,
  filter: Filter
): Expression {
  const impl = getSearchParameterImplementation(resourceType, param);
  if (impl.searchStrategy !== 'token-column') {
    throw new Error('Invalid search strategy: ' + impl.searchStrategy);
  }

  switch (filter.operator) {
    case FhirOperator.TEXT:
    case FhirOperator.CONTAINS: {
      filter.operator satisfies TokenQueryOperator;

      // https://www.hl7.org/fhir/r4/search.html#combining
      const expressions = buildTokenColumnsWhereConditionTextAndContains(
        impl,
        tableName,
        filter.code,
        filter.operator,
        filter.value
      );

      const expression = new Disjunction(expressions);
      return expression;
    }
    case FhirOperator.EQUALS:
    case FhirOperator.EXACT:
    case FhirOperator.NOT:
    case FhirOperator.NOT_EQUALS: {
      filter.operator satisfies TokenQueryOperator;

      // https://www.hl7.org/fhir/r4/search.html#combining
      const expression = buildTokenColumnsWhereConditionEqualsAndExact(
        impl,
        tableName,
        filter.code,
        filter.operator,
        filter.value
      );

      if (filter.operator === FhirOperator.NOT || filter.operator === FhirOperator.NOT_EQUALS) {
        return new Negation(expression);
      } else {
        return expression;
      }
    }
    case FhirOperator.MISSING:
    case FhirOperator.PRESENT: {
      if (!impl.hasDedicatedColumns) {
        const cond = new TypedCondition(
          new Column(tableName, impl.tokenColumnName),
          'ARRAY_OVERLAPS',
          hashTokenColumnValue(filter.code),
          'UUID[]'
        );
        if (!shouldTokenExistForMissingOrPresent(filter.operator, filter.value)) {
          return new Negation(cond);
        }
        return cond;
      }

      if (shouldTokenExistForMissingOrPresent(filter.operator, filter.value)) {
        return new TypedCondition(new Column(tableName, impl.tokenColumnName), 'ARRAY_NOT_EMPTY', undefined, 'UUID[]');
      } else {
        return new TypedCondition(new Column(tableName, impl.tokenColumnName), 'ARRAY_EMPTY', undefined, 'UUID[]');
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
      throw new OperationOutcomeError(invalidSearchOperator(filter.operator, param.id ?? param.code));
    default: {
      filter.operator satisfies never;
      throw new OperationOutcomeError(invalidSearchOperator(filter.operator, param.id ?? param.code));
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
 * @param filterValue - The query value.
 * @returns The filter expression for the search parameter without negation.
 */
function buildTokenColumnsWhereConditionTextAndContains(
  impl: TokenColumnSearchParameterImplementation,
  tableName: string,
  code: string,
  operator: TokenQueryOperator,
  filterValue: string
): Expression[] {
  const expressions: Expression[] = [];
  for (const query of splitSearchOnComma(filterValue)) {
    /*
      perform a regex search on the string generated by the token_array_to_text function
      the array entries are of the form `value` and are joined by ARRAY_DELIM
      as well as having an ARRAY_DELIM prefix and suffix on the entire string:

      For dedicated-column search parameters, the string being searched by regex is of the form:
      ARRAY_DELIM + <value1> + ARRAY_DELIM + <value2> + ... + ARRAY_DELIM

      For non-dedicated-column search parameters, the regex also matches, the format is:
      ARRAY_DELIM + <code1> + DELIM + <value1> + ARRAY_DELIM + <code2> + DELIM + <value2> + ... + ARRAY_DELIM

      this regex looks for an entry from the format described above:
       - `ARRAY_DELIM`
       - If the search parameter does NOT have dedicated columns, `code + DELIM`
       - any number of characters that are not `ARRAY_DELIM` (to support infix search)
       - the query string
      */
    let regexStr: string = '[^' + ARRAY_DELIM + ']*' + escapeRegexString(query.trim());
    if (impl.hasDedicatedColumns) {
      regexStr = ARRAY_DELIM + regexStr;
    } else {
      regexStr = ARRAY_DELIM + code + DELIM + regexStr;
    }
    const textSearchCol = new Column(tableName, impl.textSearchColumnName);
    const regexCond = new TypedCondition(textSearchCol, 'TOKEN_ARRAY_IREGEX', regexStr, 'TEXT[]');
    expressions.push(regexCond);
  }
  return expressions;
}

function buildTokenColumnsWhereConditionEqualsAndExact(
  impl: TokenColumnSearchParameterImplementation,
  tableName: string,
  code: string,
  operator: TokenQueryOperator,
  filterValue: string
): Expression {
  const searchStrings: string[] = [];
  const queries = splitSearchOnComma(filterValue).map((query) => query.trim());
  for (const query of queries) {
    /*
    exact matches on the formats:
    <system>|
    <system>|<value>
    |<value>
    <value>
    */
    let system: string;
    let value: string;
    let searchString: string;
    const parts = splitN(query, '|', 2);
    if (parts.length === 2) {
      // If query is "|foo", searching for "foo" values without a system, aka NULL_SYSTEM
      system = parts[0] || NULL_SYSTEM; // Use || instead of ?? to handle empty strings
      value = parts[1];
      if (value) {
        value = impl.caseInsensitive ? value.toLocaleLowerCase() : value;
        searchString = system + DELIM + value;
      } else {
        searchString = system;
      }
    } else {
      value = query;
      value = impl.caseInsensitive ? value.toLocaleLowerCase() : value;
      searchString = DELIM + value;
    }

    if (!impl.hasDedicatedColumns) {
      searchString = code + DELIM + searchString;
    }
    searchString = hashTokenColumnValue(searchString);
    searchStrings.push(searchString);
  }

  const condition = new Condition(
    new Column(tableName, impl.tokenColumnName),
    'ARRAY_OVERLAPS',
    searchStrings,
    'UUID[]'
  );
  return condition;
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
  return str.replaceAll(/[.^$*+?()[\]{}\\|]/g, String.raw`\$&`);
}

// Not a v5 UUID, so will not collide with hashed token values
const UUID_TEMPLATE = '00000000-0000-0000-0000-000000000000';

/**
 * May return a padding element for a UUID array column based on the provided configuration.
 * See the comment below or {@link https://github.com/medplum/medplum/issues/7539} for an
 * extended discussion.
 * @param config - The array column padding configuration object.
 * @param rng - Optional random number generator function for testing. Math.random is used by default.
 * @returns A padding element or undefined.
 */
export function getPaddingElement(
  config: ArrayColumnPaddingConfig,
  rng: () => number = Math.random
): string | undefined {
  if (rng() < (config.m * config.lambda) / (config.statisticsTarget * 300)) {
    const randomIntStr = Math.floor(rng() * config.m).toString(); // random int in [0, m)

    // more than 12 will interfere with the dashes in UUID_TEMPLATE. In practice,
    // m will be <= 100 or maybe 1000 at the very high end, so this is just a sanity check.
    if (randomIntStr.length > 12) {
      throw new Error('Array padding m too large');
    }
    return UUID_TEMPLATE.substring(0, UUID_TEMPLATE.length - randomIntStr.length) + randomIntStr;
  }

  return undefined;
}

/* array column padding config explanation, adapted from https://github.com/medplum/medplum/issues/7539

Add extra, well-known elements to array columns that fall victim to the quirk in
Postgres array column statistics discussed in https://github.com/medplum/medplum/issues/7310
as well as on a [pg mailing list thread](https://www.postgresql.org/message-id/flat/PH3PPF1C905D6E6F24A5C1A1A1D8345B593E16FA%40PH3PPF1C905D6E6.namprd15.prod.outlook.com).

The formula for minimum frequency for consideration into the MCE list:

Excerpts from the [Postgres source code](https://github.com/postgres/postgres/blob/820343bab30852142ddc50db3aa81ef58d7cb676/src/backend/utils/adt/array_typanalyze.c)
```c
// We want statistics_target * 10 elements in the MCELEM array. This
// multiplier is pretty arbitrary, but is meant to reflect the fact that
// the number of individual elements tracked in pg_statistic ought to be
// more than the number of values for a simple scalar column.
num_mcelem = stats->attr->attstattarget * 10;

 // We set bucket width equal to num_mcelem / 0.007 as per the comment
 // above.
bucket_width = num_mcelem * 1000 / 7;

 // Construct an array of the interesting hashtable items, that is,
 // those meeting the cutoff frequency (s - epsilon)*N.  Also identify
 // the minimum and maximum frequencies among these items.
 // 
 // Since epsilon = s/10 and bucket_width = 1/epsilon, the cutoff
 // frequency is 9*N / bucket_width.
cutoff_freq = 9 * element_no / bucket_width;
```

For the identifier scenario where each row has an array with a common element and a unique element.

```
element_no = 2 * row_count
bucket_width = stats_target * 10 * 1000 / 7
cutoff_freq = ⌈9 * (2 * row_count) / (stats_target * 10 * 1000 / 7)⌉
```

With a statistics target of 100, the `ANALYZE` command samples `R` = 100 * 300 = 30,000 rows.
In the “too unique” identifiers scenario, each row of the array column contains a common array
element and a unique element. The array column sample contains 60,000 total elements `n` across
the sampled `R` rows; 2 elements per row. For an element to be included in most_common_elements
(MCE), it must appear at least `k` times where:

`k = ⌈9 * 2 * 30000 /142,857⌉ ≈ ⌈3.78⌉ = 4`

This guarantees that none of the unique elements will appear in the MCE since they by definition
will not appear more than once in a given sample. The result is an MCE consisting of only the
common element and the query planner using the fallback `minfreq` value of `DEFAULT_CONTAIN_SEL = 0.005`
when querying for a unique elements; a vast over-estimate resulting in sequential scans, particularly
when querying for just a few rows, e.g. `SELECT * FROM "Patient" WHERE __identifier @> ARRAY[<unique-value>] LIMIT 2`.

To avoid this, randomly add each of `m` well-known, artificial values into a fraction `f` of all
rows such that at least one such well-known value qualifies for the MCE with a fequency `S` close
to but above `k` with high confidence `p`. Meaning each time `ANALYZE` runs,  a  `minfreq` much lower
than the default `0.005` is computed resulting in more accurate row estimates when querying for unique
elements. For each `m` to occur with frequency `f`, add a random value from `[0, m)` to the array
column with probability `m*f/30000`. Assuming a random sample, the count of these well-known values in
the sample follows a binomial distribution, which we approximate as Poisson for small `f`.

**Definitions:**

Let X = count of well-known values in sample
X ~ Binomial(30,000, f) ≈ Poisson(λ) where λ = 30,000f

**Constraints:**

`k` can be treated as a constant 4 due to ceiling operation.

**Problem statement:**

For m distinct values, we want the probability that at least one m exceeds frequency k in the sample with probability p.

**Solution:**

Using the Poisson CDF, `P(X ≥ 4) ≥ p` or  `P(X ≥ 4) = 1 - P(X ≤ 3) ≥ p`
Over all m, `1 - P(X ≤ 3)^m ≥ p`
Rewrite as `P(X ≤ 3) ≤ (1-p)^(1/m)`

**Example calculation for m = 10, p = 0.9999:**

- P(X ≤ 3) ≤ (1-0.9999)^(1/10)
- P(X ≤ 3) ≤ 0.39810717
- Minimal λ to satisfy is ~4.2
- f = λ/30,000 = 4.2/30,000 = 0.00014

**Impact on column size**

Depending on `m` and `p`, extra array elements are added to 0.25% to 0.5% of rows; 250-500 array elements per 100,000 rows.

**Sample λ(m, p) calculations**

m | p | P(X ≤ 3) ≤ | ~λ | m*f
-- | -- | -- | -- | --
10 | 0.9999 | 0.3981071706 | 4.3 | 0.14%
10 | 0.99999 | 0.316227766 | 4.7 | 0.16%
20 | 0.99999 | 0.5623413252 | 3.4 | 0.23%
20 | 0.999999 | 0.5011872336 | 3.7 | 0.25%
40 | 0.99999 | 0.7498942093 | 2.6 | 0.35%
40 | 0.999999 | 0.7079457844 | 2.8 | 0.37%
60 | 0.99999 | 0.8254041853 | 2.2 | 0.44%
60 | 0.999999 | 0.7943282347 | 2.3 | 0.46%
80 | 0.99999 | 0.8659643234 | 2 | 0.53%
80 | 0.999999 | 0.8413951416 | 2.1 | 0.56%
*/

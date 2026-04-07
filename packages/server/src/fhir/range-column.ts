// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter, SortRule, TypedValue } from '@medplum/core';
import { evalFhirPathTyped, getSearchParameterDetails, Operator, toTypedValue } from '@medplum/core';
import type { Period, Range, Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import type { RangeColumnSearchParameterImplementation } from './searchparameter';
import { getSearchParameterImplementation, SearchStrategies } from './searchparameter';
import type { Expression, SelectQuery } from './sql';
import { Column, ColumnType, Condition, Negation } from './sql';

type Interval<T extends number | Date> = {
  left?: T;
  right?: T;
  lInc?: boolean;
  rInc?: boolean;
};

export function buildRangeColumns(
  searchParam: SearchParameter,
  impl: RangeColumnSearchParameterImplementation,
  columns: Record<string, any>,
  resource: Resource
): void {
  if (searchParam.type === 'date') {
    columns[impl.rangeColumnName] = extractDateTimeParameter(searchParam, impl, resource);
  } else if (searchParam.type === 'number') {
    columns[impl.rangeColumnName] = extractNumberParameter(searchParam, impl, resource);
  } else {
    throw new Error('Unsupported search parameter type for range column: ' + searchParam.type);
  }
}

function extractDateTimeParameter(
  searchParam: SearchParameter,
  impl: RangeColumnSearchParameterImplementation,
  resource: Resource
): string | undefined {
  const details = getSearchParameterDetails(resource.resourceType, searchParam);
  const typedValues = evalFhirPathTyped(details.parsedExpression, [toTypedValue(resource)]);
  if (!typedValues.length) {
    return undefined;
  }

  if (impl.array) {
    const values = typedValues.map((v) => formatRange(buildDateTimeRange(v)));
    return `{${values.join(',')}}`;
  } else {
    const value = formatRange(buildDateTimeRange(typedValues[0]));
    return value;
  }
}

function buildDateTimeRange(typed: TypedValue): Interval<Date> {
  switch (typed.type) {
    case 'Period': {
      const { start, end } = typed.value as Period;
      const range: Interval<Date> = {};
      if (start) {
        range.left = new Date(start);
        range.lInc = true;
      }
      if (end) {
        range.right = new Date(end);
        range.rInc = true;
      }
      return range;
    }
    case 'date':
    case 'dateTime':
      return parseDateTimeToRange(typed.value);
    case 'instant': {
      const d = new Date(typed.value);
      return { lInc: true, left: d, right: d, rInc: true };
    }
    default:
      throw new Error('Cannot build datetime range from ' + typed.type);
  }
}

function parseDateTimeToRange(dt: string): Interval<Date> {
  const start = new Date(dt);
  const end = new Date(start.getTime()); // Copy start time before modifying
  const len = dt.length;
  if (len <= 4) {
    // Year precision
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  } else if (len <= 7) {
    // Month precision
    end.setUTCMonth(end.getUTCMonth() + 1);
  } else if (len <= 10) {
    // Day precision
    end.setUTCDate(end.getUTCDate() + 1);
  } else if (len <= 20) {
    // Second precision
    end.setSeconds(end.getSeconds() + 1);
  } else {
    // Millisecond precision
    end.setMilliseconds(end.getMilliseconds() + 1);
  }
  return { lInc: true, left: start, right: end, rInc: false };
}

function formatRange(r: Interval<any>): string {
  return `${r.lInc ? '[' : '('}${formatEndpoint(r.left)},${formatEndpoint(r.right)}${r.rInc ? ']' : ')'}`;
}

function formatEndpoint(e: any): string {
  return e?.toISOString?.() ?? e?.toString?.() ?? '';
}

function extractNumberParameter(
  searchParam: SearchParameter,
  impl: RangeColumnSearchParameterImplementation,
  resource: Resource
): string | undefined {
  const details = getSearchParameterDetails(resource.resourceType, searchParam);
  const typedValues = evalFhirPathTyped(details.parsedExpression, [toTypedValue(resource)]);
  if (!typedValues.length) {
    return undefined;
  }

  if (impl.array) {
    const values = typedValues.map((v) => formatRange(buildNumericRange(v)));
    return `{${values.join(',')}}`;
  } else {
    const value = formatRange(buildNumericRange(typedValues[0]));
    return value;
  }
}

function buildNumericRange(typed: TypedValue): Interval<number> {
  switch (typed.type) {
    case 'Range': {
      const { low, high } = typed.value as Range;
      const range: Interval<number> = {};
      if (low?.value !== undefined) {
        range.left = low.value;
        range.lInc = true;
      }
      if (high?.value !== undefined) {
        range.right = high.value;
        range.rInc = true;
      }
      return range;
    }
    case 'decimal':
    case 'integer':
    case 'unsignedInt':
    case 'positiveInt':
      return parseNumberToRange(typed.value);
    default:
      throw new Error('Cannot build numeric range from ' + typed.type);
  }
}

function parseNumberToRange(n: number): Interval<number> {
  // TODO: Implement precision range
  return { lInc: true, left: n, right: n, rInc: true };
}

/**
 * Adds "order by" clause to the select query builder.
 * @param selectQuery - The select query builder.
 * @param impl - The search parameter implementation.
 * @param sortRule - The sort rule details.
 */
export function addRangeColumnsOrderBy(
  selectQuery: SelectQuery,
  impl: RangeColumnSearchParameterImplementation,
  sortRule: SortRule
): void {
  /*
    [R4 spec behavior](https://www.hl7.org/fhir/r4/search.html#_sort):
    A search parameter can refer to an element that repeats, and therefore there can be
    multiple values for a given search parameter for a single resource. In this case,
    the sort is based on the item in the set of multiple parameters that comes earliest in
    the specified sort order when ordering the returned resources.

    Current behavior:
    Sorts by the lower bound of the range. This can result
    in possibly unexpected/surprising result ordering when a resource has multiple range
    values for the same field, or if the range is unbounded to the left.
  */
  selectQuery.orderBy(new Column(undefined, impl.sortColumnName), sortRule.descending);
}

export function buildRangeColumnsSearchFilter(
  resourceType: ResourceType,
  tableName: string,
  param: SearchParameter,
  filter: Filter
): Expression {
  const impl = getSearchParameterImplementation(resourceType, param);
  if (impl.searchStrategy !== SearchStrategies.RANGE_COLUMN) {
    throw new Error('Invalid search strategy: ' + impl.searchStrategy);
  }

  let range: Interval<number | Date>;
  let colType: ColumnType;
  if (param.type === 'date') {
    range = parseDateTimeToRange(filter.value);
    colType = ColumnType.TSTZRANGE;
  } else {
    range = parseNumberToRange(Number.parseFloat(filter.value));
    colType = ColumnType.NUMRANGE;
  }
  const column = new Column(tableName, impl.rangeColumnName);
  switch (filter.operator) {
    case Operator.EQUALS:
      return new Condition(column, 'RANGE_OVERLAPS', formatRange(range));
    case Operator.NOT:
    case Operator.NOT_EQUALS:
      return new Negation(new Condition(column, 'RANGE_OVERLAPS', formatRange(range)));
    case Operator.LESS_THAN:
      return new Condition(
        column,
        'RANGE_OVERLAPS',
        `(,${formatEndpoint(range.left)}${range.lInc ? ')' : ']'}`,
        colType
      );
    case Operator.LESS_THAN_OR_EQUALS:
      return new Condition(
        column,
        'RANGE_OVERLAPS',
        `(,${formatEndpoint(range.right)}${range.rInc ? ']' : ')'}`,
        colType
      );
    case Operator.GREATER_THAN:
      return new Condition(
        column,
        'RANGE_OVERLAPS',
        `${range.rInc ? '(' : '['}${formatEndpoint(range.right)},)`,
        colType
      );
    case Operator.GREATER_THAN_OR_EQUALS:
      return new Condition(
        column,
        'RANGE_OVERLAPS',
        `${range.lInc ? '[' : '('}${formatEndpoint(range.left)},)`,
        colType
      );
    case Operator.STARTS_AFTER:
      return new Condition(column, 'RANGE_STRICTLY_RIGHT_OF', formatRange(range), colType);
    case Operator.ENDS_BEFORE:
      return new Condition(column, 'RANGE_STRICTLY_LEFT_OF', formatRange(range), colType);
    default:
      throw new Error(`Unknown FHIR operator: ${filter.operator}`);
  }
}

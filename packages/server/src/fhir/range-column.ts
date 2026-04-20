// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter, SortRule, TypedValue } from '@medplum/core';
import { evalFhirPathTyped, getSearchParameterDetails, Operator, toTypedValue } from '@medplum/core';
import type { Money, Period, Quantity, Range, Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import type { RangeColumnSearchParameterImplementation } from './searchparameter';
import { getSearchParameterImplementation, SearchStrategies } from './searchparameter';
import type { Expression, SelectQuery } from './sql';
import { Column, ColumnType, Condition, Negation } from './sql';
import { shouldTokenExistForMissingOrPresent } from './tokens';

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
    extractDateTimeParameter(searchParam, impl, resource, columns);
  } else if (searchParam.type === 'number' || searchParam.type === 'quantity') {
    extractNumberParameter(searchParam, impl, resource, columns);
  } else {
    throw new Error('Unsupported search parameter type for range column: ' + searchParam.type);
  }
}

function extractDateTimeParameter(
  searchParam: SearchParameter,
  impl: RangeColumnSearchParameterImplementation,
  resource: Resource,
  columns: Record<string, any>
): void {
  const details = getSearchParameterDetails(resource.resourceType, searchParam);
  const typedValues = evalFhirPathTyped(details.parsedExpression, [toTypedValue(resource)]);
  if (!typedValues.length) {
    return;
  }

  if (impl.array) {
    let lowest: Date | undefined;
    const values = typedValues.map((v) => {
      const range = buildDateTimeRange(v);
      const lowerBound = range.left ?? range.right;
      if (!lowest || (lowerBound && lowest > lowerBound)) {
        lowest = lowerBound;
      }
      return formatRange(range);
    });
    columns[impl.rangeColumnName] = `{${values.join(',')}}`;
    columns[impl.sortColumnName] = lowest?.toISOString();
    columns[impl.columnName] = typedValues.map((t) => t.value);
  } else {
    const range = buildDateTimeRange(typedValues[0]);
    columns[impl.rangeColumnName] = formatRange(range);
    columns[impl.sortColumnName] = range.left?.toISOString() ?? range.right?.toISOString();
    columns[impl.columnName] = typedValues[0].value;
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

function parseDateTimeToRange(dt: string, approximate?: boolean): Interval<Date> {
  let start = new Date(dt);
  let end = new Date(start.getTime()); // Copy start time before modifying
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

  if (approximate) {
    const startTime = start.getTime();
    const deltaMs = (Date.now() - startTime) * 0.1;
    start = new Date(startTime - deltaMs);
    end = new Date(end.getTime() + deltaMs);
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
  resource: Resource,
  columns: Record<string, any>
): void {
  const details = getSearchParameterDetails(resource.resourceType, searchParam);
  const typedValues = evalFhirPathTyped(details.parsedExpression, [toTypedValue(resource)]);
  if (!typedValues.length) {
    return;
  }

  if (impl.array) {
    let lowest: number | undefined;
    const values = typedValues.map((v) => {
      const range = buildNumericRange(v);
      const lowerBound = range.left ?? range.right;
      if (lowest === undefined || (lowerBound !== undefined && lowest > lowerBound)) {
        lowest = lowerBound;
      }
      return formatRange(range);
    });
    columns[impl.rangeColumnName] = `{${values.join(',')}}`;
    columns[impl.sortColumnName] = lowest;
  } else {
    const range = buildNumericRange(typedValues[0]);
    const value = formatRange(range);
    columns[impl.rangeColumnName] = value;
    columns[impl.sortColumnName] = range.left ?? range.right;
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
    case 'Quantity':
    case 'Money': // Not technically a Quantity, but referenced by ChargeItem.priceOverride
      // TODO: Omit missing value?
      return parseNumberToRange((typed.value as Quantity | Money).value ?? 0);
    default:
      throw new Error('Cannot build numeric range from ' + typed.type);
  }
}

function parseNumberToRange(n: number, approximate?: boolean): Interval<number> {
  // TODO: Implement precision range
  let low = n;
  let high = n;
  let inclusive = true;
  if (approximate) {
    low = low - 0.1 * n;
    high = high + 0.1 * n;
    inclusive = false;
  }
  return { lInc: true, left: low, right: high, rInc: inclusive };
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

  const approximate = filter.operator === Operator.APPROXIMATELY;
  let range: Interval<number | Date>;
  let colType: ColumnType;
  if (param.type === 'date') {
    range = parseDateTimeToRange(filter.value, approximate);
    colType = ColumnType.TSTZRANGE;
  } else {
    range = parseNumberToRange(Number.parseFloat(filter.value), approximate);
    colType = ColumnType.NUMRANGE;
  }
  const column = new Column(tableName, impl.rangeColumnName);
  switch (filter.operator) {
    case Operator.EXACT: // Alias needed for _filter search
    case Operator.APPROXIMATELY: // Approximate target range calculated above, match against it here
    case Operator.EQUALS:
      return new Condition(column, 'RANGE_OVERLAPS', formatRange(range), colType);
    case Operator.NOT:
    case Operator.NOT_EQUALS:
      return new Negation(new Condition(column, 'RANGE_OVERLAPS', formatRange(range), colType));
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
    case Operator.MISSING:
    case Operator.PRESENT: {
      const shouldExist = shouldTokenExistForMissingOrPresent(filter.operator, filter.value);
      return new Condition(column, shouldExist ? '!=' : '=', null);
    }
    default:
      throw new Error(`Unknown FHIR operator: ${filter.operator}`);
  }
}

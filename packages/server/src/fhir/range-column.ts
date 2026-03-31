// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter, SortRule, TypedValue } from '@medplum/core';
import { evalFhirPathTyped, getSearchParameterDetails, isEmpty, Operator, toTypedValue } from '@medplum/core';
import type { Period, Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import type { RangeColumnSearchParameterImplementation } from './searchparameter';
import { getSearchParameterImplementation, SearchStrategies } from './searchparameter';
import type { Expression, SelectQuery } from './sql';
import { Column, ColumnType, Condition, Negation } from './sql';

export function buildRangeColumns(
  searchParam: SearchParameter,
  impl: RangeColumnSearchParameterImplementation,
  columns: Record<string, any>,
  resource: Resource
): void {
  if (searchParam.type === 'date') {
    columns[impl.rangeColumnName] = buildDateTimeRange(searchParam, impl, resource);
  } else if (searchParam.type === 'number') {
    columns[impl.rangeColumnName] = buildNumericRange(searchParam, impl, resource);
  } else {
    throw new Error('Unsupported search parameter type for range column: ' + searchParam.type);
  }
}

function buildDateTimeRange(
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
    const values = typedValues.map((v) => formatDateTimeRange(v));
    return `{${values.join(',')}}`;
  } else {
    const value = formatDateTimeRange(typedValues[0]);
    return value;
  }
}

function formatDateTimeRange(typed: TypedValue): string {
  if (typed.type === 'Period') {
    const { start, end } = typed.value as Period;
    const lowEndpoint = isEmpty(start) ? '(' : '[' + new Date(start as string).toISOString();
    const highEndpoint = isEmpty(end) ? ')' : new Date(end as string).toISOString() + ']';
    return `${lowEndpoint},${highEndpoint}`;
  }

  const value = typed.value;
  const d = new Date(value);
  const start = d.toISOString();
  const len = value.length;
  if (len <= 4) {
    // Year precision
    d.setFullYear(d.getFullYear() + 1);
  } else if (len <= 7) {
    // Month precision
    d.setMonth(d.getMonth() + 1);
  } else if (len <= 10) {
    // Day precision
    d.setDate(d.getDate() + 1);
  } else if (len <= 20) {
    // Second precision
    d.setSeconds(d.getSeconds() + 1);
  } else {
    // Millisecond precision
    d.setMilliseconds(d.getMilliseconds() + 1);
  }
  return `[${start},${d.toISOString()})`;
}

function buildNumericRange(
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
    const values = typedValues.map((v) => formatNumericRange(v));
    return `{${values.join(',')}}`;
  } else {
    const value = formatNumericRange(typedValues[0].value);
    return value;
  }
}

function formatNumericRange(typed: TypedValue): string {
  if (typed.type === 'Range') {
    const { low, high } = typed.value;

    const lowEndpoint = isEmpty(low?.value) ? '(' : '[' + low.value;
    const highEndpoint = isEmpty(high?.value) ? ')' : high.value + ']';
    return `${lowEndpoint},${highEndpoint}`;
  }

  const value = typed.value;
  const n = Number.parseFloat(value);
  return `[${n},${n}]`; // TODO: Implement precision range
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

    In [R5](https://www.hl7.org/fhir/r5/search.html#_sort) and beyond, that language is replaced with:
    Servers have discretion on the implementation of sorting for both repeated elements and complex
    elements. For example, if requesting a sort on Patient.name, servers might search by family name
    then given, given name then family, or prefix, family, and then given. Similarly, when sorting with
    multiple given names, the sort might be based on the 'earliest' name in sort order or the first name
    in the instance.

    Current behavior:
    Sorts by the lower bound of the range. This can result
    in possibly unexpected/surprising result ordering when a resource has multiple range
    values for the same field, or if the range is unbounded to the left.

    To avoid the surprising behavior, we could store both the lower and upper bound
    values for each search parameter.
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

  const column = new Column(tableName, impl.rangeColumnName);
  switch (filter.operator) {
    case Operator.EQUALS:
      return new Condition(column, 'RANGE_OVERLAPS', periodRangeString);
    case Operator.NOT:
    case Operator.NOT_EQUALS:
      return new Negation(new Condition(column, 'RANGE_OVERLAPS', periodRangeString));
    case Operator.LESS_THAN:
      return new Condition(column, 'RANGE_OVERLAPS', `(,${period.end})`, ColumnType.TSTZRANGE);
    case Operator.LESS_THAN_OR_EQUALS:
      return new Condition(column, 'RANGE_OVERLAPS', `(,${period.end}]`, ColumnType.TSTZRANGE);
    case Operator.GREATER_THAN:
      return new Condition(column, 'RANGE_OVERLAPS', `(${period.start},)`, ColumnType.TSTZRANGE);
    case Operator.GREATER_THAN_OR_EQUALS:
      return new Condition(column, 'RANGE_OVERLAPS', `[${period.start},)`, ColumnType.TSTZRANGE);
    case Operator.STARTS_AFTER:
      return new Condition(column, 'RANGE_STRICTLY_RIGHT_OF', periodRangeString, ColumnType.TSTZRANGE);
    case Operator.ENDS_BEFORE:
      return new Condition(column, 'RANGE_STRICTLY_LEFT_OF', periodRangeString, ColumnType.TSTZRANGE);
    default:
      throw new Error(`Unknown FHIR operator: ${filter.operator}`);
  }
}

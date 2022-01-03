import { Filter, getPropertyDisplayName, IndexedStructureDefinition, Operator, SearchRequest } from '@medplum/core';
import { Resource, SearchParameter } from '@medplum/fhirtypes';
import React from 'react';
import { DateTimeDisplay } from './DateTimeDisplay';
import { getValueAndType, ResourcePropertyDisplay } from './ResourcePropertyDisplay';

const searchParamToOperators: Record<string, Operator[]> = {
  string: [Operator.EQUALS, Operator.NOT_EQUALS, Operator.CONTAINS, Operator.EXACT],
  fulltext: [Operator.EQUALS, Operator.NOT_EQUALS, Operator.CONTAINS, Operator.EXACT],
  token: [Operator.EQUALS, Operator.NOT_EQUALS],
  reference: [Operator.EQUALS, Operator.NOT_EQUALS],
  numeric: [
    Operator.EQUALS,
    Operator.NOT_EQUALS,
    Operator.GREATER_THAN,
    Operator.LESS_THAN,
    Operator.GREATER_THAN_OR_EQUALS,
    Operator.LESS_THAN_OR_EQUALS,
  ],
  date: [
    Operator.EQUALS,
    Operator.NOT_EQUALS,
    Operator.GREATER_THAN,
    Operator.LESS_THAN,
    Operator.GREATER_THAN_OR_EQUALS,
    Operator.LESS_THAN_OR_EQUALS,
    Operator.STARTS_AFTER,
    Operator.ENDS_BEFORE,
    Operator.APPROXIMATELY,
  ],
  datetime: [
    Operator.EQUALS,
    Operator.NOT_EQUALS,
    Operator.GREATER_THAN,
    Operator.LESS_THAN,
    Operator.GREATER_THAN_OR_EQUALS,
    Operator.LESS_THAN_OR_EQUALS,
    Operator.STARTS_AFTER,
    Operator.ENDS_BEFORE,
    Operator.APPROXIMATELY,
  ],
};

const operatorNames: Record<Operator, string> = {
  eq: 'equals',
  ne: 'not equals',
  gt: 'greater than',
  lt: 'less than',
  ge: 'greater than or equals',
  le: 'less than or equals',
  sa: 'starts after',
  eb: 'ends before',
  ap: 'approximately',
  contains: 'contains',
  exact: 'exact',
  text: 'text',
  above: 'above',
  below: 'below',
  in: 'in',
  'not-in': 'not in',
  'of-type': 'of type',
};

/**
 * Sets the array of filters.
 *
 * @param {Array} filters The new filters.
 */
export function setFilters(definition: SearchRequest, filters: Filter[]): SearchRequest {
  return {
    ...definition,
    filters: filters,
    name: undefined,
  };
}

/**
 * Clears all of the filters.
 */
export function clearFilters(definition: SearchRequest): SearchRequest {
  return setFilters(definition, []);
}

/**
 * Clears all of the filters on a certain field.
 *
 * @param {string} code The field key name to clear filters.
 */
export function clearFiltersOnField(definition: SearchRequest, code: string): SearchRequest {
  return setFilters(
    definition,
    (definition.filters || []).filter((f) => f.code !== code)
  );
}

/**
 * Adds a filter.
 *
 * @param {string} field The field key name.
 * @param {Operator} op The operation key name.
 * @param {?string} value The filter value.
 * @param {boolean=} opt_clear Optional flag to clear filters on the field.
 */
export function addFilter(
  definition: SearchRequest,
  field: string,
  op: Operator,
  value?: string,
  opt_clear?: boolean
): SearchRequest {
  if (opt_clear) {
    definition = clearFiltersOnField(definition, field);
  }

  const nextFilters: Filter[] = [];
  if (definition.filters) {
    nextFilters.push(...definition.filters);
  }
  nextFilters.push({ code: field, operator: op, value: value || '' });

  return setFilters(definition, nextFilters);
}

/**
 * Adds a field.
 *
 * @param {string} field The field key name.
 */
export function addField(definition: SearchRequest, field: string): SearchRequest {
  if (definition.fields && definition.fields.includes(field)) {
    return definition;
  }
  const newFields = [];
  if (definition.fields) {
    newFields.push(...definition.fields);
  }
  newFields.push(field);
  return {
    ...definition,
    fields: newFields,
    name: undefined,
  };
}

/**
 * Deletes a filter at the specified index.
 *
 * @param {number} index The filter index.
 */
export function deleteFilter(definition: SearchRequest, index: number): SearchRequest {
  if (!definition.filters) {
    return definition;
  }
  const newFilters = [...definition.filters];
  newFilters.splice(index, 1);
  return {
    ...definition,
    filters: newFilters,
    name: undefined,
  };
}

/**
 * Adds a filter that constrains the specified field to "yesterday".
 *
 * @param {string} field The field key name.
 */
export function addYesterdayFilter(definition: SearchRequest, field: string): SearchRequest {
  return addDayFilter(definition, field, -1);
}

/**
 * Adds a filter that constrains the specified field to "today".
 *
 * @param {string} field The field key name.
 */
export function addTodayFilter(definition: SearchRequest, field: string): SearchRequest {
  return addDayFilter(definition, field, 0);
}

/**
 * Adds a filter that constrains the specified field to "tomorrow".
 *
 * @param {string} field The field key name.
 */
export function addTomorrowFilter(definition: SearchRequest, field: string): SearchRequest {
  return addDayFilter(definition, field, 1);
}

/**
 * Adds a filter that constrains the specified field to a day.
 * The day is specified as a delta from the current day.
 * "Today" would be 0.
 * "Yesterday" would be -1.
 * "Tomorrow" would be 1.
 *
 * @param {string} field The field key name.
 * @param {number} delta The number of days from this day.
 */
function addDayFilter(definition: SearchRequest, field: string, delta: number): SearchRequest {
  const startTime = new Date();
  startTime.setDate(startTime.getDate() + delta);
  startTime.setHours(0, 0, 0, 0);

  const endTime = new Date(startTime.getTime());
  endTime.setDate(endTime.getDate() + 1);
  endTime.setTime(endTime.getTime() - 1);

  return addDateFilterBetween(definition, field, startTime, endTime);
}

/**
 * Adds a filter that constrains the specified field to "last month".
 *
 * @param {string} field The field key name.
 */
export function addLastMonthFilter(definition: SearchRequest, field: string): SearchRequest {
  return addMonthFilter(definition, field, -1);
}

/**
 * Adds a filter that constrains the specified field to "this month".
 *
 * @param {string} field The field key name.
 */
export function addThisMonthFilter(definition: SearchRequest, field: string): SearchRequest {
  return addMonthFilter(definition, field, 0);
}

/**
 * Adds a filter that constrains the specified field to "next month".
 *
 * @param {string} field The field key name.
 */
export function addNextMonthFilter(definition: SearchRequest, field: string): SearchRequest {
  return addMonthFilter(definition, field, 1);
}

/**
 * Adds a filter that constrains the specified field to a month.
 * The month is specified as a delta from the current month.
 * "This month" would be 0.
 * "Last month" would be -1.
 * "Next month" would be 1.
 *
 * @param {string} field The field key name.
 * @param {number} delta The number of months from this month.
 */
function addMonthFilter(definition: SearchRequest, field: string, delta: number): SearchRequest {
  const startTime = new Date();
  startTime.setMonth(startTime.getMonth() + delta);
  startTime.setDate(1);
  startTime.setHours(0, 0, 0, 0);

  const endTime = new Date(startTime.getTime());
  endTime.setMonth(endTime.getMonth() + 1);
  endTime.setDate(1);
  endTime.setHours(0, 0, 0, 0);
  endTime.setTime(endTime.getTime() - 1);

  return addDateFilterBetween(definition, field, startTime, endTime);
}

/**
 * Adds a filter that constrains the specified field to the year to date.
 *
 * @param {string} field The field key name.
 */
export function addYearToDateFilter(definition: SearchRequest, field: string): SearchRequest {
  const startTime = new Date();
  startTime.setMonth(0);
  startTime.setDate(1);
  startTime.setHours(0, 0, 0, 0);

  const endTime = new Date();

  return addDateFilterBetween(definition, field, startTime, endTime);
}

/**
 * Adds a filter for a field equaling a specified date.
 *
 * @param {string} field The field key name.
 * @param {Date} value The date.
 */
export function addDateEqualsFilter(definition: SearchRequest, field: string, value: Date): SearchRequest {
  return addDateFilterBetween(definition, field, value, value);
}

/**
 * Adds a filter for a date before a certain date/time.
 *
 * @param {string} field The field key name.
 * @param {Operator} op The date/time operation.
 * @param {Date} value The date.
 */
export function addDateFilter(definition: SearchRequest, field: string, op: Operator, value: Date): SearchRequest {
  definition = clearFiltersOnField(definition, field);
  return addDateFilterImpl(definition, field, op, value);
}

/**
 * Adds a filter for a date between two dates (inclusive of both dates).
 *
 * @param {string} field The field key name.
 * @param {Date} d1 The start date.
 * @param {Date} d2 The end date.
 */
export function addDateFilterBetween(definition: SearchRequest, field: string, d1: Date, d2: Date): SearchRequest {
  definition = clearFiltersOnField(definition, field);
  definition = addDateFilterImpl(definition, field, Operator.GREATER_THAN_OR_EQUALS, d1);
  definition = addDateFilterImpl(definition, field, Operator.LESS_THAN_OR_EQUALS, d2);
  return definition;
}

/**
 * Adds a filter for a date before a certain date/time.
 *
 * @param {string} field The field key name.
 * @param {Operator} op The date/time operation.
 * @param {Date} value The date.
 */
function addDateFilterImpl(definition: SearchRequest, field: string, op: Operator, value: Date): SearchRequest {
  return addFilter(definition, field, op, value.toISOString());
}

/**
 * Adds a filter for a user field.
 *
 * @param field
 * @param op
 * @param value
 */
export function addUserFilter(definition: SearchRequest, field: string, op: Operator, value: string): SearchRequest {
  definition = clearFiltersOnField(definition, field);
  return addFilter(definition, field, op, value);
}

/**
 * Returns true if the search has any filters on the specified field.
 *
 * @param {string} code The field key name.
 */
export function hasFilterOnField(definition: SearchRequest, code: string): boolean {
  if (!definition.filters) {
    return false;
  }
  return definition.filters.find((f) => f.code === code) !== undefined;
}

/**
 * Sets the page number (starting at zero).
 *
 * @param {number} page The page number.
 */
export function setPage(definition: SearchRequest, page: number): SearchRequest {
  if (definition.page === page) {
    return definition;
  }
  return {
    ...definition,
    page: page,
    name: undefined,
  };
}

/**
 * Moves the page forward or backward.
 *
 * @param {number} delta The delta to the page number.
 * @return {boolean} True if the page actually moved; false otherwise.
 */
export function movePage(definition: SearchRequest, delta: number): SearchRequest {
  return setPage(definition, Math.max((definition.page || 0) + (delta || 0), 0));
}

/**
 * Sorts the search by the specified key, and optional direction.
 * Direction defaults to ascending ('asc') if not specified.
 *
 * @param {string} sortField The sort key.
 */
export function setSort(definition: SearchRequest, sort: string, desc?: boolean): SearchRequest {
  if (sort === getSortField(definition) && desc !== undefined && desc === isSortDescending(definition)) {
    return definition;
  }
  return {
    ...definition,
    sortRules: [
      {
        code: sort,
        descending: !!desc,
      },
    ],
    name: undefined,
  };
}

/**
 * Toggles the sort of the search by key.
 * If the search is already sorted by the key, reverses the direction.
 * If the search is not sorted by the key, sort in ascending order.
 *
 * @param {string} key The field key name.
 */
export function toggleSort(definition: SearchRequest, key: string): SearchRequest {
  let desc = false;
  if (getSortField(definition) === key) {
    desc = !isSortDescending(definition);
  }
  return setSort(definition, key, desc);
}

export function getSortField(definition: SearchRequest): string | undefined {
  const sortRules = definition.sortRules;
  if (!sortRules || sortRules.length === 0) {
    return undefined;
  }
  const field = sortRules[0].code;
  return field.startsWith('-') ? field.substr(1) : field;
}

export function isSortDescending(definition: SearchRequest): boolean {
  const sortRules = definition.sortRules;
  if (!sortRules || sortRules.length === 0) {
    return false;
  }
  return !!sortRules[0].descending;
}

/**
 * Returns a list of operators for a search parameter.
 * @param searchParam The search parameter.
 * @returns The list of operators that can be used for the search parameter.
 */
export function getSearchOperators(searchParam: SearchParameter): Operator[] | undefined {
  return searchParamToOperators[searchParam.type as string];
}

/**
 * Returns a string representing the operation.
 *
 * @param {string} op The operation code.
 * @return {string} A display string for the operation.
 */
export function getOpString(op: Operator): string {
  return operatorNames[op] ?? '';
}

export function buildFieldNameString(schema: IndexedStructureDefinition, resourceType: string, key: string): string {
  if (key === 'id') {
    return 'ID';
  }

  if (key === 'meta.versionId') {
    return 'Version ID';
  }

  if (key === '_lastUpdated') {
    return 'Last Updated';
  }

  const typeDef = schema.types[resourceType];
  if (!typeDef) {
    return key;
  }

  const property = typeDef.properties[key];
  if (!property) {
    return key;
  }

  return getPropertyDisplayName(property);
}

/**
 * Returns a fragment to be displayed in the search table for the value.
 * @param schema The currently indexed schema.
 * @param resource The parent resource.
 * @param key The search code or FHIRPath expression.
 * @returns The fragment to display.
 */
export function renderValue(
  schema: IndexedStructureDefinition,
  resource: Resource,
  key: string
): string | JSX.Element | null | undefined {
  if (key === 'id') {
    return resource.id;
  }

  if (key === 'meta.versionId') {
    return resource.meta?.versionId;
  }

  if (key === '_lastUpdated') {
    return <DateTimeDisplay value={resource.meta?.lastUpdated} />;
  }

  const property = schema.types[resource.resourceType]?.properties?.[key];
  if (!property) {
    return null;
  }

  const [value, propertyType] = getValueAndType(resource, property);
  if (!value) {
    return null;
  }

  return (
    <ResourcePropertyDisplay
      schema={schema}
      property={property}
      propertyType={propertyType}
      value={value}
      maxWidth={200}
      ignoreMissingValues={true}
    />
  );
}

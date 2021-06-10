import { HumanName, IndexedStructureDefinition, SearchDefinition, SearchFilterDefinition } from '@medplum/core';
import React from 'react';
import { formatHumanName } from './HumanNameUtils';

/**
 * Sets the array of filters.
 *
 * @param {Array} filters The new filters.
 */
export function setFilters(definition: SearchDefinition, filters: SearchFilterDefinition[]) {
  return {
    ...definition,
    filters: filters,
    name: undefined
  };
}

/**
 * Clears all of the filters.
 */
export function clearFilters(definition: SearchDefinition) {
  return setFilters(definition, []);
}

/**
 * Clears all of the filters on a certain field.
 *
 * @param {string} fieldKey The field key name to clear filters.
 */
export function clearFiltersOnField(definition: SearchDefinition, fieldKey: string) {
  return setFilters(definition, (definition.filters || []).filter(f => f.key !== fieldKey));
}

/**
 * Adds a filter.
 *
 * @param {string} field The field key name.
 * @param {string} op The operation key name.
 * @param {?string} value The filter value.
 * @param {boolean=} opt_clear Optional flag to clear filters on the field.
 */
export function addFilter(
  definition: SearchDefinition,
  field: string,
  op: string,
  value?: string,
  opt_clear?: boolean) {

  if (opt_clear) {
    definition = clearFiltersOnField(definition, field);
  }

  const nextFilters = [];
  if (definition.filters) {
    nextFilters.push(...definition.filters);
  }
  nextFilters.push({ key: field, op: op, value: value });

  return setFilters(definition, nextFilters);
}

/**
 * Adds a field.
 *
 * @param {string} field The field key name.
 */
export function addField(definition: SearchDefinition, field: string) {
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
    name: undefined
  };
}

/**
 * Adds a countField.
 *
 * @param {string} countField The field key name.
 */
export function addCountField(definition: SearchDefinition, countField: string) {
  if (definition.countField === countField) {
    return definition;
  }
  return {
    ...definition,
    countField: countField,
    name: undefined
  }
}

/**
 * Removes a countField.
 */
export function removeCountField(definition: SearchDefinition) {
  if (definition.countField === undefined) {
    return definition;
  }
  return {
    ...definition,
    countField: undefined,
    name: undefined
  }
}

/**
 * Deletes a filter at the specified index.
 *
 * @param {number} index The filter index.
 */
export function deleteFilter(definition: SearchDefinition, index: number) {
  if (!definition.filters) {
    return definition;
  }
  const newFilters = [...definition.filters];
  newFilters.splice(index, 1);
  return {
    ...definition,
    filters: newFilters,
    name: undefined
  };
}

/**
 * Adds a filter that constrains the specified field to "yesterday".
 *
 * @param {string} field The field key name.
 */
export function addYesterdayFilter(definition: SearchDefinition, field: string) {
  return addDayFilter_(definition, field, -1);
}

/**
 * Adds a filter that constrains the specified field to "today".
 *
 * @param {string} field The field key name.
 */
export function addTodayFilter(definition: SearchDefinition, field: string) {
  return addDayFilter_(definition, field, 0);
}

/**
 * Adds a filter that constrains the specified field to "tomorrow".
 *
 * @param {string} field The field key name.
 */
export function addTomorrowFilter(definition: SearchDefinition, field: string) {
  return addDayFilter_(definition, field, 1);
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
function addDayFilter_(definition: SearchDefinition, field: string, delta: number) {
  const startTime = new Date();
  startTime.setDate(startTime.getDate() + delta);
  startTime.setHours(0);
  startTime.setMinutes(0);
  startTime.setSeconds(0);
  startTime.setMilliseconds(0);

  const endTime = new Date(startTime.getTime());
  endTime.setDate(endTime.getDate() + 1);

  return addDateFilterBetween(definition, field, startTime, endTime);
}

/**
 * Adds a filter that constrains the specified field to "last month".
 *
 * @param {string} field The field key name.
 */
export function addLastMonthFilter(definition: SearchDefinition, field: string) {
  return addMonthFilter_(definition, field, -1);
}

/**
 * Adds a filter that constrains the specified field to "this month".
 *
 * @param {string} field The field key name.
 */
export function addThisMonthFilter(definition: SearchDefinition, field: string) {
  return addMonthFilter_(definition, field, 0);
}

/**
 * Adds a filter that constrains the specified field to "next month".
 *
 * @param {string} field The field key name.
 */
export function addNextMonthFilter(definition: SearchDefinition, field: string) {
  return addMonthFilter_(definition, field, 1);
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
function addMonthFilter_(definition: SearchDefinition, field: string, delta: number) {
  const startTime = new Date();
  startTime.setMonth(startTime.getMonth() + delta);
  startTime.setDate(1);
  startTime.setHours(0);
  startTime.setMinutes(0);
  startTime.setSeconds(0);
  startTime.setMilliseconds(0);

  const endTime = new Date(startTime.getTime());
  endTime.setTime(startTime.getTime());
  endTime.setMonth(endTime.getMonth() + 1);

  return addDateFilterBetween(definition, field, startTime, endTime);
}

/**
 * Adds a filter that constrains the specified field to the year to date.
 *
 * @param {string} field The field key name.
 */
export function addYearToDateFilter(definition: SearchDefinition, field: string) {
  const startTime = new Date();
  startTime.setMonth(0);
  startTime.setDate(1);
  startTime.setHours(0);
  startTime.setMinutes(0);
  startTime.setSeconds(0);
  startTime.setMilliseconds(0);

  definition = clearFiltersOnField(definition, field);

  return addFilter(
    definition,
    field,
    'after_datetime',
    startTime.toISOString());
}

/**
 * Adds a filter for a field equaling a specified date.
 *
 * @param {string} field The field key name.
 * @param {Date} value The date.
 */
export function addDateEqualsFilter(definition: SearchDefinition, field: string, value: Date) {
  return addDateFilterBetween(definition, field, value, value);
}

/**
 * Adds a filter for a date before a certain date/time.
 *
 * @param {string} field The field key name.
 * @param {string} op The date/time operation.
 * @param {Date} value The date.
 */
export function addDateFilter(definition: SearchDefinition, field: string, op: string, value: Date): SearchDefinition {
  definition = clearFiltersOnField(definition, field);
  return addDateFilterImpl_(definition, field, op, value);
}

/**
 * Adds a filter for a date between two dates (inclusive of both dates).
 *
 * @param {string} field The field key name.
 * @param {Date} d1 The start date.
 * @param {Date} d2 The end date.
 * @param {boolean=} opt_exclusive Optional flag for exclusive end date.
 */
export function addDateFilterBetween(definition: SearchDefinition, field: string, d1: Date, d2: Date, opt_exclusive?: boolean) {

  if (!opt_exclusive) {
    // Between is inclusive.  Therefore, we need to push out the end date.
    d2 = new Date(d2.getTime());
    d2.setDate(d2.getDate() + 1);
  }

  definition = clearFiltersOnField(definition, field);
  definition = addDateFilter(definition, field, 'after_datetime', d1);
  definition = addDateFilter(definition, field, 'before_datetime', d2);
  return definition;
}

/**
 * Adds a filter for a date before a certain date/time.
 *
 * @param {string} field The field key name.
 * @param {string} op The date/time operation.
 * @param {Date} value The date.
 */
function addDateFilterImpl_(definition: SearchDefinition, field: string, op: string, value: Date) {
  const dateTime = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  dateTime.setHours(0);
  dateTime.setMinutes(0);
  dateTime.setSeconds(0);
  dateTime.setMilliseconds(0);

  return addFilter(
    definition,
    field,
    op,
    dateTime.toISOString());
}

/**
 * Adds a filter for a user field.
 *
 * @param field
 * @param op
 * @param value
 */
export function addUserFilter(definition: SearchDefinition, field: string, op: string, value: string) {
  definition = clearFiltersOnField(definition, field);
  return addFilter(definition, field, op, value);
}

/**
 * Returns true if the search has any filters on the specified field.
 *
 * @param {string} field The field key name.
 */
export function hasFilterOnField(definition: SearchDefinition, field: string) {
  if (!definition.filters) {
    return false;
  }
  return definition.filters.find(f => f.key === field) !== undefined;
}

/**
 * Sets the page number (starting at zero).
 *
 * @param {number} page The page number.
 */
export function setPage(definition: SearchDefinition, page: number) {
  if (definition.page === page) {
    return definition;
  }
  return {
    ...definition,
    page: page,
    name: undefined
  };
}

/**
 * Moves the page forward or backward.
 *
 * @param {number} delta The delta to the page number.
 * @return {boolean} True if the page actually moved; false otherwise.
 */
export function movePage(definition: SearchDefinition, delta: number) {
  return setPage(definition, Math.max((definition.page || 0) + (delta || 0), 0));
}

/**
 * Sorts the search by the specified key, and optional direction.
 * Direction defaults to ascending ('asc') if not specified.
 *
 * @param {string} sortField The sort key.
 */
export function setSort(definition: SearchDefinition, sort: string, desc?: boolean) {
  if (sort === getSortField(definition) &&
    (desc !== undefined && desc === isSortDescending(definition))) {
    return definition;
  }
  return {
    ...definition,
    sort: (desc === true ? '-' : '') + sort,
    name: undefined
  }
}

/**
 * Toggles the sort of the search by key.
 * If the search is already sorted by the key, reverses the direction.
 * If the search is not sorted by the key, sort in ascending order.
 *
 * @param {string} key The field key name.
 */
export function toggleSort(definition: SearchDefinition, key: string) {
  let desc = false;
  if (getSortField(definition) === key) {
    desc = !isSortDescending(definition);
  }
  return setSort(definition, key, desc);
}

export function getSortField(definition: SearchDefinition) {
  const sort = definition.sort;
  if (!sort) {
    return undefined;
  }
  const fields = sort.split(',');
  const field = fields[0];
  return field.startsWith('-') ? field.substr(1) : field;
}

export function isSortDescending(definition: SearchDefinition) {
  const sort = definition.sort;
  if (!sort) {
    return false;
  }
  return sort.startsWith('-');
}

/**
 * Returns a string representing the operation.
 *
 * @param {string} op The operation code.
 * @return {string} A display string for the operation.
 */
export function getOpString(op: string) {
  if (!op) {
    return '';
  }

  if (op === 'before_datetime') {
    return 'before';

  } else if (op === 'after_datetime') {
    return 'after';

  } else if (op === 'newer_than_interval') {
    return 'newer than';

  } else if (op === 'older_than_interval') {
    return 'older than';

  } else if (op === 'equals') {
    return 'equals';

  } else if (op === 'not_equals') {
    return 'does not equal';

  } else if (op === 'contains') {
    return 'contains';

  } else if (op === 'not_contains') {
    return 'does not contain';

  } else if (op === 'is_set') {
    return 'is set';

  } else if (op === 'is_not_set') {
    return 'is not set';
  }

  return op;
}

export function buildFieldNameString(schema: IndexedStructureDefinition, resourceType: string, key: string): string {
  if (key === 'id') {
    return 'ID';
  }

  if (key === 'meta.versionId') {
    return 'Version ID';
  }

  if (key === 'meta.lastUpdated') {
    return 'Last Updated';
  }

  const typeDef = schema.types[resourceType];
  if (!typeDef) {
    return key;
  }

  const field = typeDef.properties[key];
  if (!field) {
    return key;
  }

  return field.display;
}

/**
 * Returns a HTML fragment to be displayed in the filter table for the value.
 *
 * @param {!Object|!string} field The field object or key.
 * @param {?string} op The filter operation (e.g., "equals").
 * @param {*} value The filter value
 * @param {boolean=} opt_quotes Optional flag to put quotes around strings.
 * @return {string} An HTML fragment that represents the value.
 */
export function getFilterValueString(filter: SearchFilterDefinition) {
  const value = filter.value;
  if (!value) {
    return <span className="muted">none</span>;
  }

  const chunks = value.split(';');
  return chunks.map((c: string) => '"' + c + '"').join(' or ');
}

/**
 * Returns one of the meta fields.
 *
 * @param {!string} key The field key.
 * @return {*} The value.
 */
export function getValue(resource: any, key: string) {
  try {
    return key.split('.').reduce((o, i) => o[i], resource);
  } catch (ex) {
    return undefined;
  }
}

/**
 * Returns a HTML fragment to be displayed in the search table for the value.
 *
 * @param {!string} key The field key name.
 * @param {*} value The filter value
 * @return {string} An HTML fragment that represents the value.
 */
export function renderValue(schema: IndexedStructureDefinition, resourceType: string, key: string, value: any): string | JSX.Element {
  if (!value) {
    return <span className="muted">none</span>;
  }

  if (key === 'id' || key === 'meta.versionId') {
    return value;
  }

  if (key === 'meta.lastUpdated') {
    return new Date(value).toLocaleString('en-US');
  }

  const typeDef = schema.types[resourceType];
  if (!typeDef) {
    return JSON.stringify(value);
  }

  const field = typeDef.properties[key];
  if (!field) {
    return JSON.stringify(value);
  }

  if (field.type === 'string') {
    return value.toString();
  }

  if (field.type === 'HumanName') {
    const names = value as HumanName[];
    if (names.length > 0) {
      return formatHumanName(names[0]);
    } else {
      return '';
    }
  }

  if (field['type'] === 'map') {
    return JSON.stringify(value);
  }

  return JSON.stringify(value);
}

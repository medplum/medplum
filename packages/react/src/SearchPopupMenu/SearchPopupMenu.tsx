// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Menu } from '@mantine/core';
import type { SearchRequest } from '@medplum/core';
import type { SearchParameter } from '@medplum/fhirtypes';
import {
  IconCalendarDue,
  IconCalendarMonth,
  IconCalendarTime,
  IconCheck,
  IconFilter2Plus,
  IconSortAscending,
  IconSortDescending,
  IconX,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { Fragment } from 'react';
import classes from '../SearchControl/SearchControl.module.css';
import {
  addLastMonthFilter,
  addNextMonthFilter,
  addThisMonthFilter,
  addTodayFilter,
  addTomorrowFilter,
  addYearToDateFilter,
  addYesterdayFilter,
  clearFiltersOnField,
  setSort,
} from '../SearchControl/SearchUtils';

export interface SearchPopupMenuProps {
  readonly search: SearchRequest;
  readonly searchParams?: SearchParameter[];
  readonly onChange: (definition: SearchRequest) => void;
  /** When provided, adds a "Filter by this column" item that opens the toolbar Filters popover. */
  readonly onFilterByColumn?: (searchParam: SearchParameter) => void;
}

type RelativeDateOption = {
  readonly label: string;
  readonly Icon: typeof IconCalendarDue;
  readonly apply: (search: SearchRequest, code: string) => SearchRequest;
  readonly future?: boolean;
  /** The end is "now" at the time it was picked, so only the start is compared. */
  readonly openEnded?: boolean;
};

/** Relative date shortcuts for date columns, grouped by day, month and year. */
const RELATIVE_DATE_GROUPS: RelativeDateOption[][] = [
  [
    { label: 'Tomorrow', Icon: IconCalendarDue, apply: addTomorrowFilter, future: true },
    { label: 'Today', Icon: IconCalendarDue, apply: addTodayFilter },
    { label: 'Yesterday', Icon: IconCalendarDue, apply: addYesterdayFilter },
  ],
  [
    { label: 'Next Month', Icon: IconCalendarMonth, apply: addNextMonthFilter, future: true },
    { label: 'This Month', Icon: IconCalendarMonth, apply: addThisMonthFilter },
    { label: 'Last Month', Icon: IconCalendarMonth, apply: addLastMonthFilter },
  ],
  [{ label: 'Year to date', Icon: IconCalendarTime, apply: addYearToDateFilter, openEnded: true }],
];

const CHECK = <IconCheck size={16} color="var(--mantine-color-blue-6)" />;

/**
 * Returns true when the column's filters are exactly the start/end pair this relative date
 * produces today.
 * @param option - The relative date option.
 * @param search - The current search.
 * @param code - The column's search parameter code.
 * @returns True if the option is the column's current filter.
 */
function isRelativeDateSelected(option: RelativeDateOption, search: SearchRequest, code: string): boolean {
  const actual = (search.filters ?? []).filter((filter) => filter.code === code);
  const expected = option.apply({ resourceType: search.resourceType }, code).filters ?? [];
  if (actual.length !== expected.length) {
    return false;
  }
  return expected.every((filter, i) => {
    const matchesValue = option.openEnded && i > 0 ? true : actual[i].value === filter.value;
    return actual[i].operator === filter.operator && matchesValue;
  });
}

/** Date search parameters that can only hold past dates, so future shortcuts are hidden. */
const PAST_ONLY_DATE_CODES = new Set(['_lastUpdated', 'death-date']);

/**
 * Returns the relative date groups offered for a date column, without future options for
 * past-only dates.
 * @param code - The column's search parameter code.
 * @returns The relative date groups.
 */
function getRelativeDateGroups(code: string): RelativeDateOption[][] {
  if (!PAST_ONLY_DATE_CODES.has(code)) {
    return RELATIVE_DATE_GROUPS;
  }
  return RELATIVE_DATE_GROUPS.map((group) => group.filter((option) => !option.future));
}

/**
 * Direction labels vary by the search parameter type so they read naturally, matching the global
 * Sort editor (dates sort oldest/newest, numbers smallest/largest, everything else A→Z).
 * @param type - The search parameter type.
 * @returns The ascending and descending sort labels.
 */
function getSortLabels(type: string | undefined): { asc: string; desc: string } {
  switch (type) {
    case 'date':
      return { asc: 'Sort Oldest to Newest', desc: 'Sort Newest to Oldest' };
    case 'number':
    case 'quantity':
      return { asc: 'Sort Smallest to Largest', desc: 'Sort Largest to Smallest' };
    default:
      return { asc: 'Sort A to Z', desc: 'Sort Z to A' };
  }
}

/**
 * The column-header dropdown offering the two sort directions for the column (any type), relative date
 * filters for date columns, "Filter by this column" to open the toolbar Filters popover, and "Clear all
 * column filters" when the column has filters. Date columns show only one of the last two.
 * @param props - The popup menu props.
 * @returns The sort menu dropdown, or null when the column is not backed by a search parameter.
 */
export function SearchPopupMenu(props: SearchPopupMenuProps): JSX.Element | null {
  const searchParam = props.searchParams?.[0];
  if (!searchParam) {
    return null;
  }

  const code = searchParam.code;
  const labels = getSortLabels(searchParam.type);
  const isDate = searchParam.type === 'date';
  const hasColumnFilters = !!props.search.filters?.some((filter) => filter.code === code);
  const showFilterByColumn = !!props.onFilterByColumn && !(isDate && hasColumnFilters);

  function isSortSelected(descending: boolean): boolean {
    return !!props.search.sortRules?.some((rule) => rule.code === code && !!rule.descending === descending);
  }

  function onSort(descending: boolean): void {
    const existing = props.search.sortRules ?? [];
    if (existing.length >= 2) {
      const sortRules = existing.some((rule) => rule.code === code)
        ? existing.map((rule) => (rule.code === code ? { code, descending } : rule))
        : [...existing, { code, descending }];
      props.onChange({ ...props.search, sortRules, name: undefined });
      return;
    }
    props.onChange(setSort(props.search, code, descending));
  }

  return (
    <Menu.Dropdown className={classes.menuDropdown}>
      <Menu.Item
        leftSection={<IconSortAscending size={16} color="var(--mantine-color-dimmed)" />}
        rightSection={isSortSelected(false) ? CHECK : null}
        onClick={() => onSort(false)}
      >
        {labels.asc}
      </Menu.Item>
      <Menu.Item
        leftSection={<IconSortDescending size={16} color="var(--mantine-color-dimmed)" />}
        rightSection={isSortSelected(true) ? CHECK : null}
        onClick={() => onSort(true)}
      >
        {labels.desc}
      </Menu.Item>
      {isDate &&
        getRelativeDateGroups(code).map((group) => (
          <Fragment key={group[0].label}>
            <Menu.Divider />
            {group.map((option) => (
              <Menu.Item
                key={option.label}
                leftSection={<option.Icon size={16} color="var(--mantine-color-dimmed)" />}
                rightSection={isRelativeDateSelected(option, props.search, code) ? CHECK : null}
                onClick={() => props.onChange(option.apply(props.search, code))}
              >
                {option.label}
              </Menu.Item>
            ))}
          </Fragment>
        ))}
      {showFilterByColumn && (
        <>
          <Menu.Divider />
          <Menu.Item
            leftSection={<IconFilter2Plus size={16} color="var(--mantine-color-dimmed)" />}
            onClick={() => props.onFilterByColumn?.(searchParam)}
          >
            Filter by this column
          </Menu.Item>
        </>
      )}
      {hasColumnFilters && (
        <>
          <Menu.Divider />
          <Menu.Item
            leftSection={<IconX size={16} color="var(--mantine-color-dimmed)" />}
            onClick={() => props.onChange(clearFiltersOnField(props.search, code))}
          >
            Clear all column filters
          </Menu.Item>
        </>
      )}
    </Menu.Dropdown>
  );
}

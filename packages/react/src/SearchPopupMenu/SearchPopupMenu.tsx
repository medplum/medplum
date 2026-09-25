// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Menu } from '@mantine/core';
import type { SearchRequest } from '@medplum/core';
import type { SearchParameter } from '@medplum/fhirtypes';
import { IconCalendar, IconFilter2Plus, IconSortAscending, IconSortDescending } from '@tabler/icons-react';
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
  readonly apply: (search: SearchRequest, code: string) => SearchRequest;
  readonly future?: boolean;
};

/** Relative date shortcuts for date columns, grouped by day, month and year. */
const RELATIVE_DATE_GROUPS: RelativeDateOption[][] = [
  [
    { label: 'Tomorrow', apply: addTomorrowFilter, future: true },
    { label: 'Today', apply: addTodayFilter },
    { label: 'Yesterday', apply: addYesterdayFilter },
  ],
  [
    { label: 'Next Month', apply: addNextMonthFilter, future: true },
    { label: 'This Month', apply: addThisMonthFilter },
    { label: 'Last Month', apply: addLastMonthFilter },
  ],
  [{ label: 'Year to date', apply: addYearToDateFilter }],
];

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
 * filters for date columns, and "Filter by this column" to open the toolbar Filters popover.
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
      <Menu.Item leftSection={<IconSortAscending size={14} />} onClick={() => onSort(false)}>
        {labels.asc}
      </Menu.Item>
      <Menu.Item leftSection={<IconSortDescending size={14} />} onClick={() => onSort(true)}>
        {labels.desc}
      </Menu.Item>
      {searchParam.type === 'date' &&
        getRelativeDateGroups(code).map((group) => (
          <Fragment key={group[0].label}>
            <Menu.Divider />
            {group.map(({ label, apply }) => (
              <Menu.Item
                key={label}
                leftSection={<IconCalendar size={14} />}
                onClick={() => props.onChange(apply(props.search, code))}
              >
                {label}
              </Menu.Item>
            ))}
          </Fragment>
        ))}
      {props.onFilterByColumn && (
        <>
          <Menu.Divider />
          <Menu.Item leftSection={<IconFilter2Plus size={14} />} onClick={() => props.onFilterByColumn?.(searchParam)}>
            Filter by this column
          </Menu.Item>
        </>
      )}
    </Menu.Dropdown>
  );
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Menu } from '@mantine/core';
import type { Filter, SearchRequest } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { SearchParameter } from '@medplum/fhirtypes';
import {
  IconBleach,
  IconBleachOff,
  IconBracketsContain,
  IconBucket,
  IconBucketOff,
  IconCalendarDue,
  IconCalendarMonth,
  IconCalendarTime,
  IconCheck,
  IconEqual,
  IconEqualNot,
  IconMathGreater,
  IconMathLower,
  IconSettings,
  IconSortAscending,
  IconSortDescending,
  IconX,
} from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { Fragment } from 'react';
import classes from '../SearchControl/SearchControl.module.css';
import {
  addLastMonthFilter,
  addMissingFilter,
  addNext24HoursFilter,
  addNextMonthFilter,
  addThisMonthFilter,
  addTodayFilter,
  addTomorrowFilter,
  addYearToDateFilter,
  addYesterdayFilter,
  buildFieldNameString,
  clearFiltersOnField,
  setSort,
} from '../SearchControl/SearchUtils';

export interface SearchPopupMenuProps {
  readonly search: SearchRequest;
  readonly searchParams?: SearchParameter[];
  readonly onPrompt: (searchParam: SearchParameter, filter: Filter) => void;
  readonly onChange: (definition: SearchRequest) => void;
}

const ICON_SIZE = 16;
const ICON_COLOR = 'var(--mantine-color-dimmed)';
const CHECK = <IconCheck size={ICON_SIZE} color="var(--mantine-color-blue-6)" />;

/**
 * Column header dropdown: sort directions, filter prompts, relative date shortcuts (for dates),
 * missing / not missing, and clear filters for the column's search parameter.
 * @param props - The popup menu props.
 * @returns The menu dropdown, or null when the column is not backed by a search parameter.
 */
export function SearchPopupMenu(props: SearchPopupMenuProps): JSX.Element | null {
  if (!props.searchParams) {
    return null;
  }

  function onSort(searchParam: SearchParameter, desc: boolean): void {
    onChange(setSort(props.search, searchParam.code, desc));
  }

  function onClear(searchParam: SearchParameter): void {
    onChange(clearFiltersOnField(props.search, searchParam.code));
  }

  function onPrompt(searchParam: SearchParameter, operator: Operator): void {
    props.onPrompt(searchParam, { code: searchParam.code, operator, value: '' });
  }

  function onChange(definition: SearchRequest): void {
    props.onChange(definition);
  }

  if (props.searchParams.length === 1) {
    return (
      <SearchParameterSubMenu
        search={props.search}
        searchParam={props.searchParams[0]}
        onSort={onSort}
        onPrompt={onPrompt}
        onChange={onChange}
        onClear={onClear}
      />
    );
  }

  return (
    <Menu.Dropdown className={classes.menuDropdown}>
      {props.searchParams.map((searchParam) => (
        <Menu.Item key={searchParam.code}>{buildFieldNameString(searchParam.code)}</Menu.Item>
      ))}
    </Menu.Dropdown>
  );
}

interface SearchPopupSubMenuProps {
  readonly search: SearchRequest;
  readonly searchParam: SearchParameter;
  readonly onSort: (searchParam: SearchParameter, descending: boolean) => void;
  readonly onPrompt: (searchParam: SearchParameter, operator: Operator) => void;
  readonly onChange: (search: SearchRequest) => void;
  readonly onClear: (searchParam: SearchParameter) => void;
}

function SearchParameterSubMenu(props: SearchPopupSubMenuProps): JSX.Element {
  switch (props.searchParam.type) {
    case 'date':
      return <DateFilterSubMenu {...props} />;
    case 'number':
    case 'quantity':
      return <NumericFilterSubMenu {...props} />;
    case 'reference':
      return <ReferenceFilterSubMenu {...props} />;
    case 'string':
      return <TextFilterSubMenu {...props} />;
    case 'token':
      return <TokenFilterSubMenu {...props} />;
    case 'uri':
      return <UriFilterSubMenu {...props} />;
    default:
      return <>Unknown search param type: {props.searchParam.type}</>;
  }
}

interface MenuEntryProps {
  readonly icon: ReactNode;
  readonly checked?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}

function MenuEntry(props: MenuEntryProps): JSX.Element {
  return (
    <Menu.Item leftSection={props.icon} rightSection={props.checked ? CHECK : null} onClick={props.onClick}>
      {props.children}
    </Menu.Item>
  );
}

interface SortItemsProps extends SearchPopupSubMenuProps {
  readonly ascLabel: string;
  readonly descLabel: string;
}

function SortItems(props: SortItemsProps): JSX.Element {
  const { searchParam } = props;
  const isSelected = (descending: boolean): boolean =>
    !!props.search.sortRules?.some((rule) => rule.code === searchParam.code && !!rule.descending === descending);
  return (
    <>
      <MenuEntry
        icon={<IconSortAscending size={ICON_SIZE} color={ICON_COLOR} />}
        checked={isSelected(false)}
        onClick={() => props.onSort(searchParam, false)}
      >
        {props.ascLabel}
      </MenuEntry>
      <MenuEntry
        icon={<IconSortDescending size={ICON_SIZE} color={ICON_COLOR} />}
        checked={isSelected(true)}
        onClick={() => props.onSort(searchParam, true)}
      >
        {props.descLabel}
      </MenuEntry>
      <Menu.Divider />
    </>
  );
}

interface EqualityItemsProps extends SearchPopupSubMenuProps {
  readonly notOperator: Operator;
}

function EqualityItems(props: EqualityItemsProps): JSX.Element {
  const { searchParam } = props;
  return (
    <>
      <MenuEntry
        icon={<IconEqual size={ICON_SIZE} color={ICON_COLOR} />}
        onClick={() => props.onPrompt(searchParam, Operator.EQUALS)}
      >
        Equals...
      </MenuEntry>
      <MenuEntry
        icon={<IconEqualNot size={ICON_SIZE} color={ICON_COLOR} />}
        onClick={() => props.onPrompt(searchParam, props.notOperator)}
      >
        Does not equal...
      </MenuEntry>
    </>
  );
}

type RelativeDateOption = {
  readonly label: string;
  readonly Icon: typeof IconCalendarDue;
  readonly apply: (search: SearchRequest, code: string) => SearchRequest;
  /** The end is "now" at the time it was picked, so only the start is compared. */
  readonly openEnded?: boolean;
};

const RELATIVE_DATE_GROUPS: RelativeDateOption[][] = [
  [
    { label: 'Tomorrow', Icon: IconCalendarDue, apply: addTomorrowFilter },
    { label: 'Today', Icon: IconCalendarDue, apply: addTodayFilter },
    { label: 'Yesterday', Icon: IconCalendarDue, apply: addYesterdayFilter },
    { label: 'Next 24 Hours', Icon: IconCalendarTime, apply: addNext24HoursFilter },
  ],
  [
    { label: 'Next Month', Icon: IconCalendarMonth, apply: addNextMonthFilter },
    { label: 'This Month', Icon: IconCalendarMonth, apply: addThisMonthFilter },
    { label: 'Last Month', Icon: IconCalendarMonth, apply: addLastMonthFilter },
  ],
  [{ label: 'Year to date', Icon: IconCalendarTime, apply: addYearToDateFilter, openEnded: true }],
];

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

function DateFilterSubMenu(props: SearchPopupSubMenuProps): JSX.Element {
  const { searchParam } = props;
  const code = searchParam.code;
  return (
    <Menu.Dropdown className={classes.menuDropdown}>
      <SortItems {...props} ascLabel="Sort Oldest to Newest" descLabel="Sort Newest to Oldest" />
      <EqualityItems {...props} notOperator={Operator.NOT_EQUALS} />
      <Menu.Divider />
      <MenuEntry
        icon={<IconMathLower size={ICON_SIZE} color={ICON_COLOR} />}
        onClick={() => props.onPrompt(searchParam, Operator.ENDS_BEFORE)}
      >
        Before...
      </MenuEntry>
      <MenuEntry
        icon={<IconMathGreater size={ICON_SIZE} color={ICON_COLOR} />}
        onClick={() => props.onPrompt(searchParam, Operator.STARTS_AFTER)}
      >
        After...
      </MenuEntry>
      <MenuEntry
        icon={<IconBracketsContain size={ICON_SIZE} color={ICON_COLOR} />}
        onClick={() => props.onPrompt(searchParam, Operator.EQUALS)}
      >
        Between...
      </MenuEntry>
      {RELATIVE_DATE_GROUPS.map((group) => (
        <Fragment key={group[0].label}>
          <Menu.Divider />
          {group.map((option) => (
            <MenuEntry
              key={option.label}
              icon={<option.Icon size={ICON_SIZE} color={ICON_COLOR} />}
              checked={isRelativeDateSelected(option, props.search, code)}
              onClick={() => props.onChange(option.apply(props.search, code))}
            >
              {option.label}
            </MenuEntry>
          ))}
        </Fragment>
      ))}
      <CommonMenuItems {...props} />
    </Menu.Dropdown>
  );
}

function NumericFilterSubMenu(props: SearchPopupSubMenuProps): JSX.Element {
  const { searchParam } = props;
  return (
    <Menu.Dropdown className={classes.menuDropdown}>
      <SortItems {...props} ascLabel="Sort Smallest to Largest" descLabel="Sort Largest to Smallest" />
      <EqualityItems {...props} notOperator={Operator.NOT_EQUALS} />
      <Menu.Divider />
      <MenuEntry
        icon={<IconMathGreater size={ICON_SIZE} color={ICON_COLOR} />}
        onClick={() => props.onPrompt(searchParam, Operator.GREATER_THAN)}
      >
        Greater than...
      </MenuEntry>
      <MenuEntry
        icon={<IconSettings size={ICON_SIZE} color={ICON_COLOR} />}
        onClick={() => props.onPrompt(searchParam, Operator.GREATER_THAN_OR_EQUALS)}
      >
        Greater than or equal to...
      </MenuEntry>
      <MenuEntry
        icon={<IconMathLower size={ICON_SIZE} color={ICON_COLOR} />}
        onClick={() => props.onPrompt(searchParam, Operator.LESS_THAN)}
      >
        Less than...
      </MenuEntry>
      <MenuEntry
        icon={<IconSettings size={ICON_SIZE} color={ICON_COLOR} />}
        onClick={() => props.onPrompt(searchParam, Operator.LESS_THAN_OR_EQUALS)}
      >
        Less than or equal to...
      </MenuEntry>
      <CommonMenuItems {...props} />
    </Menu.Dropdown>
  );
}

function ReferenceFilterSubMenu(props: SearchPopupSubMenuProps): JSX.Element {
  return (
    <Menu.Dropdown className={classes.menuDropdown}>
      <EqualityItems {...props} notOperator={Operator.NOT} />
      <CommonMenuItems {...props} />
    </Menu.Dropdown>
  );
}

function TextFilterSubMenu(props: SearchPopupSubMenuProps): JSX.Element {
  const { searchParam } = props;
  return (
    <Menu.Dropdown className={classes.menuDropdown}>
      <SortItems {...props} ascLabel="Sort A to Z" descLabel="Sort Z to A" />
      <EqualityItems {...props} notOperator={Operator.NOT} />
      <Menu.Divider />
      <MenuEntry
        icon={<IconBucket size={ICON_SIZE} color={ICON_COLOR} />}
        onClick={() => props.onPrompt(searchParam, Operator.CONTAINS)}
      >
        Contains...
      </MenuEntry>
      <MenuEntry
        icon={<IconBucketOff size={ICON_SIZE} color={ICON_COLOR} />}
        onClick={() => props.onPrompt(searchParam, Operator.EQUALS)}
      >
        Does not contain...
      </MenuEntry>
      <CommonMenuItems {...props} />
    </Menu.Dropdown>
  );
}

function TokenFilterSubMenu(props: SearchPopupSubMenuProps): JSX.Element {
  const { searchParam } = props;
  return (
    <Menu.Dropdown className={classes.menuDropdown}>
      <EqualityItems {...props} notOperator={Operator.NOT} />
      <Menu.Divider />
      <MenuEntry
        icon={<IconEqual size={ICON_SIZE} color={ICON_COLOR} />}
        onClick={() => props.onPrompt(searchParam, Operator.TEXT)}
      >
        Text contains...
      </MenuEntry>
      <CommonMenuItems {...props} />
    </Menu.Dropdown>
  );
}

function UriFilterSubMenu(props: SearchPopupSubMenuProps): JSX.Element {
  return (
    <Menu.Dropdown className={classes.menuDropdown}>
      <EqualityItems {...props} notOperator={Operator.NOT} />
      <CommonMenuItems {...props} />
    </Menu.Dropdown>
  );
}

function CommonMenuItems(props: SearchPopupSubMenuProps): JSX.Element {
  const { searchParam } = props;
  const code = searchParam.code;
  return (
    <>
      <Menu.Divider />
      <MenuEntry
        icon={<IconBleach size={ICON_SIZE} color={ICON_COLOR} />}
        onClick={() => props.onChange(addMissingFilter(props.search, code))}
      >
        Missing
      </MenuEntry>
      <MenuEntry
        icon={<IconBleachOff size={ICON_SIZE} color={ICON_COLOR} />}
        onClick={() => props.onChange(addMissingFilter(props.search, code, false))}
      >
        Not missing
      </MenuEntry>
      <Menu.Divider />
      <MenuEntry icon={<IconX size={ICON_SIZE} color={ICON_COLOR} />} onClick={() => props.onClear(searchParam)}>
        Clear filters
      </MenuEntry>
    </>
  );
}

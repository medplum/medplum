import { Menu } from '@mantine/core';
import { Filter, Operator, SearchRequest } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';
import {
  IconBleach,
  IconBleachOff,
  IconBracketsContain,
  IconBucket,
  IconBucketOff,
  IconCalendar,
  IconEqual,
  IconEqualNot,
  IconMathGreater,
  IconMathLower,
  IconSettings,
  IconSortAscending,
  IconSortDescending,
  IconX,
} from '@tabler/icons-react';
import {
  addLastMonthFilter,
  addMissingFilter,
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

export function SearchPopupMenu(props: SearchPopupMenuProps): JSX.Element | null {
  if (!props.searchParams) {
    return null;
  }

  function onSort(searchParam: SearchParameter, desc: boolean): void {
    onChange(setSort(props.search, searchParam.code as string, desc));
  }

  function onClear(searchParam: SearchParameter): void {
    onChange(clearFiltersOnField(props.search, searchParam.code as string));
  }

  function onPrompt(searchParam: SearchParameter, operator: Operator): void {
    props.onPrompt(searchParam, { code: searchParam.code as string, operator, value: '' });
  }

  function onChange(definition: SearchRequest): void {
    props.onChange(definition);
  }

  // If there is only one search parameter, then show it directly
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

  // Otherwise, show a menu, with each search parameter as a sub menu
  return (
    <Menu.Dropdown>
      {props.searchParams.map((searchParam) => (
        <Menu.Item key={searchParam.code}>{buildFieldNameString(searchParam.code as string)}</Menu.Item>
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
    case 'uri':
      return <TokenFilterSubMenu {...props} />;
    default:
      return <>Unknown search param type: {props.searchParam.type}</>;
  }
}

function DateFilterSubMenu(props: SearchPopupSubMenuProps): JSX.Element {
  const { searchParam } = props;
  const code = searchParam.code as string;
  return (
    <Menu.Dropdown>
      <Menu.Item leftSection={<IconSortAscending size={14} />} onClick={() => props.onSort(searchParam, false)}>
        Sort Oldest to Newest
      </Menu.Item>
      <Menu.Item leftSection={<IconSortDescending size={14} />} onClick={() => props.onSort(searchParam, true)}>
        Sort Newest to Oldest
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item leftSection={<IconEqual size={14} />} onClick={() => props.onPrompt(searchParam, Operator.EQUALS)}>
        Equals...
      </Menu.Item>
      <Menu.Item
        leftSection={<IconEqualNot size={14} />}
        onClick={() => props.onPrompt(searchParam, Operator.NOT_EQUALS)}
      >
        Does not equal...
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item
        leftSection={<IconMathLower size={14} />}
        onClick={() => props.onPrompt(searchParam, Operator.ENDS_BEFORE)}
      >
        Before...
      </Menu.Item>
      <Menu.Item
        leftSection={<IconMathGreater size={14} />}
        onClick={() => props.onPrompt(searchParam, Operator.STARTS_AFTER)}
      >
        After...
      </Menu.Item>
      <Menu.Item
        leftSection={<IconBracketsContain size={14} />}
        onClick={() => props.onPrompt(searchParam, Operator.EQUALS)}
      >
        Between...
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item
        leftSection={<IconCalendar size={14} />}
        onClick={() => props.onChange(addTomorrowFilter(props.search, code))}
      >
        Tomorrow
      </Menu.Item>
      <Menu.Item
        leftSection={<IconCalendar size={14} />}
        onClick={() => props.onChange(addTodayFilter(props.search, code))}
      >
        Today
      </Menu.Item>
      <Menu.Item
        leftSection={<IconCalendar size={14} />}
        onClick={() => props.onChange(addYesterdayFilter(props.search, code))}
      >
        Yesterday
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item
        leftSection={<IconCalendar size={14} />}
        onClick={() => props.onChange(addNextMonthFilter(props.search, code))}
      >
        Next Month
      </Menu.Item>
      <Menu.Item
        leftSection={<IconCalendar size={14} />}
        onClick={() => props.onChange(addThisMonthFilter(props.search, code))}
      >
        This Month
      </Menu.Item>
      <Menu.Item
        leftSection={<IconCalendar size={14} />}
        onClick={() => props.onChange(addLastMonthFilter(props.search, code))}
      >
        Last Month
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item
        leftSection={<IconCalendar size={14} />}
        onClick={() => props.onChange(addYearToDateFilter(props.search, code))}
      >
        Year to date
      </Menu.Item>
      <CommonMenuItems {...props} />
    </Menu.Dropdown>
  );
}

function NumericFilterSubMenu(props: SearchPopupSubMenuProps): JSX.Element {
  const { searchParam } = props;
  return (
    <Menu.Dropdown>
      <Menu.Item leftSection={<IconSortAscending size={14} />} onClick={() => props.onSort(searchParam, false)}>
        Sort Smallest to Largest
      </Menu.Item>
      <Menu.Item leftSection={<IconSortDescending size={14} />} onClick={() => props.onSort(searchParam, true)}>
        Sort Largest to Smallest
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item leftSection={<IconEqual size={14} />} onClick={() => props.onPrompt(searchParam, Operator.EQUALS)}>
        Equals...
      </Menu.Item>
      <Menu.Item
        leftSection={<IconEqualNot size={14} />}
        onClick={() => props.onPrompt(searchParam, Operator.NOT_EQUALS)}
      >
        Does not equal...
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item
        leftSection={<IconMathGreater size={14} />}
        onClick={() => props.onPrompt(searchParam, Operator.GREATER_THAN)}
      >
        Greater than...
      </Menu.Item>
      <Menu.Item
        leftSection={<IconSettings size={14} />}
        onClick={() => props.onPrompt(searchParam, Operator.GREATER_THAN_OR_EQUALS)}
      >
        Greater than or equal to...
      </Menu.Item>
      <Menu.Item
        leftSection={<IconMathLower size={14} />}
        onClick={() => props.onPrompt(searchParam, Operator.LESS_THAN)}
      >
        Less than...
      </Menu.Item>
      <Menu.Item
        leftSection={<IconSettings size={14} />}
        onClick={() => props.onPrompt(searchParam, Operator.LESS_THAN_OR_EQUALS)}
      >
        Less than or equal to...
      </Menu.Item>
      <CommonMenuItems {...props} />
    </Menu.Dropdown>
  );
}

function ReferenceFilterSubMenu(props: SearchPopupSubMenuProps): JSX.Element {
  const { searchParam } = props;
  return (
    <Menu.Dropdown>
      <Menu.Item leftSection={<IconEqual size={14} />} onClick={() => props.onPrompt(searchParam, Operator.EQUALS)}>
        Equals...
      </Menu.Item>
      <Menu.Item leftSection={<IconEqualNot size={14} />} onClick={() => props.onPrompt(searchParam, Operator.NOT)}>
        Does not equal...
      </Menu.Item>
      <CommonMenuItems {...props} />
    </Menu.Dropdown>
  );
}

function TextFilterSubMenu(props: SearchPopupSubMenuProps): JSX.Element {
  const { searchParam } = props;
  return (
    <Menu.Dropdown>
      <Menu.Item leftSection={<IconSortAscending size={14} />} onClick={() => props.onSort(searchParam, false)}>
        Sort A to Z
      </Menu.Item>
      <Menu.Item leftSection={<IconSortDescending size={14} />} onClick={() => props.onSort(searchParam, true)}>
        Sort Z to A
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item leftSection={<IconEqual size={14} />} onClick={() => props.onPrompt(searchParam, Operator.EQUALS)}>
        Equals...
      </Menu.Item>
      <Menu.Item leftSection={<IconEqualNot size={14} />} onClick={() => props.onPrompt(searchParam, Operator.NOT)}>
        Does not equal...
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item leftSection={<IconBucket size={14} />} onClick={() => props.onPrompt(searchParam, Operator.CONTAINS)}>
        Contains...
      </Menu.Item>
      <Menu.Item leftSection={<IconBucketOff size={14} />} onClick={() => props.onPrompt(searchParam, Operator.EQUALS)}>
        Does not contain...
      </Menu.Item>
      <CommonMenuItems {...props} />
    </Menu.Dropdown>
  );
}

function TokenFilterSubMenu(props: SearchPopupSubMenuProps): JSX.Element {
  const { searchParam } = props;
  return (
    <Menu.Dropdown>
      <Menu.Item leftSection={<IconEqual size={14} />} onClick={() => props.onPrompt(searchParam, Operator.EQUALS)}>
        Equals...
      </Menu.Item>
      <Menu.Item leftSection={<IconEqualNot size={14} />} onClick={() => props.onPrompt(searchParam, Operator.NOT)}>
        Does not equal...
      </Menu.Item>
      <CommonMenuItems {...props} />
    </Menu.Dropdown>
  );
}

function CommonMenuItems(props: SearchPopupSubMenuProps): JSX.Element {
  const { searchParam } = props;
  const code = searchParam.code as string;
  return (
    <>
      <Menu.Divider />
      <Menu.Item
        leftSection={<IconBleach size={14} />}
        onClick={() => props.onChange(addMissingFilter(props.search, code))}
      >
        Missing
      </Menu.Item>
      <Menu.Item
        leftSection={<IconBleachOff size={14} />}
        onClick={() => props.onChange(addMissingFilter(props.search, code, false))}
      >
        Not missing
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item leftSection={<IconX size={14} />} onClick={() => props.onClear(searchParam)}>
        Clear filters
      </Menu.Item>
    </>
  );
}

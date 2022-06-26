import { Filter, IndexedStructureDefinition, Operator, SearchRequest } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';
import React from 'react';
import { MenuItem } from './MenuItem';
import { MenuSeparator } from './MenuSeparator';
import { Popup } from './Popup';
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
} from './SearchUtils';
import { SubMenu } from './SubMenu';

export interface SearchPopupMenuProps {
  schema: IndexedStructureDefinition;
  search: SearchRequest;
  visible: boolean;
  x: number;
  y: number;
  searchParams?: SearchParameter[];
  onPrompt: (searchParam: SearchParameter, filter: Filter) => void;
  onChange: (definition: SearchRequest) => void;
  onClose: () => void;
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

  const anchor = { left: props.x, right: props.x, top: props.y, bottom: props.y } as DOMRectReadOnly;

  // If there is only one search parameter, then show it directly
  if (props.searchParams.length === 1) {
    return (
      <Popup visible={props.visible} anchor={anchor} autoClose={true} onClose={props.onClose}>
        <SearchParameterSubMenu
          search={props.search}
          searchParam={props.searchParams[0]}
          onSort={onSort}
          onPrompt={onPrompt}
          onChange={onChange}
          onClear={onClear}
        />
      </Popup>
    );
  }

  // Otherwise, show a menu, with each search parameter as a sub menu
  return (
    <Popup visible={props.visible} anchor={anchor} autoClose={true} onClose={props.onClose}>
      {props.searchParams.map((searchParam) => (
        <SubMenu key={searchParam.code as string} title={buildFieldNameString(searchParam.code as string)}>
          <SearchParameterSubMenu
            search={props.search}
            searchParam={searchParam}
            onSort={onSort}
            onPrompt={onPrompt}
            onChange={onChange}
            onClear={onClear}
          />
        </SubMenu>
      ))}
    </Popup>
  );
}

interface SearchPopupSubMenuProps {
  search: SearchRequest;
  searchParam: SearchParameter;
  onSort: (searchParam: SearchParameter, descending: boolean) => void;
  onPrompt: (searchParam: SearchParameter, operator: Operator) => void;
  onChange: (search: SearchRequest) => void;
  onClear: (searchParam: SearchParameter) => void;
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
    case 'token':
    case 'uri':
      return <TextFilterSubMenu {...props} />;
    default:
      return <>Unknown search param type: {props.searchParam.type}</>;
  }
}

function DateFilterSubMenu(props: SearchPopupSubMenuProps): JSX.Element {
  const { searchParam } = props;
  const code = searchParam.code as string;
  return (
    <>
      <MenuItem onClick={() => props.onSort(searchParam, false)}>Sort Oldest to Newest</MenuItem>
      <MenuItem onClick={() => props.onSort(searchParam, true)}>Sort Newest to Oldest</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.EQUALS)}>Equals...</MenuItem>
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.NOT_EQUALS)}>Does not equal...</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.ENDS_BEFORE)}>Before...</MenuItem>
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.STARTS_AFTER)}>After...</MenuItem>
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.EQUALS)}>Between...</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onChange(addTomorrowFilter(props.search, code))}>Tomorrow</MenuItem>
      <MenuItem onClick={() => props.onChange(addTodayFilter(props.search, code))}>Today</MenuItem>
      <MenuItem onClick={() => props.onChange(addYesterdayFilter(props.search, code))}>Yesterday</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onChange(addNextMonthFilter(props.search, code))}>Next Month</MenuItem>
      <MenuItem onClick={() => props.onChange(addThisMonthFilter(props.search, code))}>This Month</MenuItem>
      <MenuItem onClick={() => props.onChange(addLastMonthFilter(props.search, code))}>Last Month</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onChange(addYearToDateFilter(props.search, code))}>Year to date</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onChange(addMissingFilter(props.search, code))}>Missing</MenuItem>
      <MenuItem onClick={() => props.onChange(addMissingFilter(props.search, code, false))}>Not missing</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onClear(searchParam)}>Clear filters</MenuItem>
    </>
  );
}

function NumericFilterSubMenu(props: SearchPopupSubMenuProps): JSX.Element {
  const { searchParam } = props;
  const code = searchParam.code as string;
  return (
    <>
      <MenuItem onClick={() => props.onSort(searchParam, false)}>Sort Smallest to Largest</MenuItem>
      <MenuItem onClick={() => props.onSort(searchParam, true)}>Sort Largest to Smallest</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.EQUALS)}>Equals...</MenuItem>
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.NOT_EQUALS)}>Does not equal...</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.GREATER_THAN)}>Greater than...</MenuItem>
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.GREATER_THAN_OR_EQUALS)}>
        Greater than or equal to...
      </MenuItem>
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.LESS_THAN)}>Less than...</MenuItem>
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.LESS_THAN_OR_EQUALS)}>
        Less than or equal to...
      </MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onChange(addMissingFilter(props.search, code))}>Missing</MenuItem>
      <MenuItem onClick={() => props.onChange(addMissingFilter(props.search, code, false))}>Not missing</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onClear(searchParam)}>Clear filters</MenuItem>
    </>
  );
}

function ReferenceFilterSubMenu(props: SearchPopupSubMenuProps): JSX.Element {
  const { searchParam } = props;
  const code = searchParam.code as string;
  return (
    <>
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.EQUALS)}>Equals...</MenuItem>
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.NOT_EQUALS)}>Does not equal...</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onChange(addMissingFilter(props.search, code))}>Missing</MenuItem>
      <MenuItem onClick={() => props.onChange(addMissingFilter(props.search, code, false))}>Not missing</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onClear(searchParam)}>Clear filters</MenuItem>
    </>
  );
}

function TextFilterSubMenu(props: SearchPopupSubMenuProps): JSX.Element {
  const { searchParam } = props;
  const code = searchParam.code as string;
  return (
    <>
      <MenuItem onClick={() => props.onSort(searchParam, false)}>Sort A to Z</MenuItem>
      <MenuItem onClick={() => props.onSort(searchParam, true)}>Sort Z to A</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.EQUALS)}>Equals...</MenuItem>
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.NOT_EQUALS)}>Does not equal...</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.CONTAINS)}>Contains...</MenuItem>
      <MenuItem onClick={() => props.onPrompt(searchParam, Operator.EQUALS)}>Does not contain...</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onChange(addMissingFilter(props.search, code))}>Missing</MenuItem>
      <MenuItem onClick={() => props.onChange(addMissingFilter(props.search, code, false))}>Not missing</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => props.onClear(searchParam)}>Clear filters</MenuItem>
    </>
  );
}

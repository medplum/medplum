import { Filter, IndexedStructureDefinition, Operator, SearchRequest } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';
import React from 'react';
import { MenuItem } from './MenuItem';
import { MenuSeparator } from './MenuSeparator';
import { Popup } from './Popup';
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
} from './SearchUtils';
import { SubMenu } from './SubMenu';

export interface SearchPopupMenuProps {
  schema: IndexedStructureDefinition;
  search: SearchRequest;
  visible: boolean;
  x: number;
  y: number;
  searchParam?: SearchParameter;
  onPrompt: (filter: Filter) => void;
  onChange: (definition: SearchRequest) => void;
  onClose: () => void;
}

export function SearchPopupMenu(props: SearchPopupMenuProps): JSX.Element | null {
  if (!props.searchParam) {
    return null;
  }

  const code = props.searchParam.code as string;
  const paramType = props.searchParam.type as string;

  /**
   * Returns the string that represents the "sort ascending" operation.
   *
   * @return {string} The string that represents "sort ascending".
   */
  function getAscSortString(): string {
    switch (paramType) {
      case 'date':
        return 'Sort Oldest to Newest';
      case 'number':
      case 'quantity':
        return 'Sort Smallest to Largest';
      default:
        return 'Sort A to Z';
    }
  }

  /**
   * Returns the string that represents the "sort descending" operation.
   *
   * @return {string} The string that represents "sort descending".
   */
  function getDescSortString(): string {
    switch (paramType) {
      case 'date':
        return 'Sort Newest to Oldest';
      case 'number':
      case 'quantity':
        return 'Sort Largest to Smallest';
      default:
        return 'Sort Z to A';
    }
  }

  /**
   * Returns the submenu of specialized tools for a particular property type.
   *
   * @return {SubMenu} The new submenu.
   */
  function renderSubMenu(): JSX.Element {
    return paramType === 'date' ? renderDateTimeSubMenu() : renderTextSubMenu();
  }

  /**
   * Returns the submenu of specialized tools for date/time fields.
   *
   * @return {SubMenu} The date/time submenu.
   */
  function renderDateTimeSubMenu(): JSX.Element {
    return (
      <SubMenu title="Date filters">
        <MenuItem onClick={() => prompt(Operator.EQUALS)}>Equals...</MenuItem>
        <MenuItem onClick={() => prompt(Operator.NOT_EQUALS)}>Does not equal...</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => prompt(Operator.ENDS_BEFORE)}>Before...</MenuItem>
        <MenuItem onClick={() => prompt(Operator.STARTS_AFTER)}>After...</MenuItem>
        <MenuItem onClick={() => prompt(Operator.EQUALS)}>Between...</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => onChange(addTomorrowFilter(props.search, code))}>Tomorrow</MenuItem>
        <MenuItem onClick={() => onChange(addTodayFilter(props.search, code))}>Today</MenuItem>
        <MenuItem onClick={() => onChange(addYesterdayFilter(props.search, code))}>Yesterday</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => onChange(addNextMonthFilter(props.search, code))}>Next Month</MenuItem>
        <MenuItem onClick={() => onChange(addThisMonthFilter(props.search, code))}>This Month</MenuItem>
        <MenuItem onClick={() => onChange(addLastMonthFilter(props.search, code))}>Last Month</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => onChange(addYearToDateFilter(props.search, code))}>Year to date</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => prompt(Operator.EQUALS)}>Is set</MenuItem>
        <MenuItem onClick={() => prompt(Operator.EQUALS)}>Is not set</MenuItem>
      </SubMenu>
    );
  }

  /**
   * Returns the submenu of specialized tools for text fields.
   *
   * @return {SubMenu} The text property submenu.
   */
  function renderTextSubMenu(): JSX.Element {
    return (
      <SubMenu title="Text filters">
        <MenuItem onClick={() => prompt(Operator.EQUALS)}>Equals...</MenuItem>
        <MenuItem onClick={() => prompt(Operator.NOT_EQUALS)}>Does not equal...</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => prompt(Operator.CONTAINS)}>Contains...</MenuItem>
        <MenuItem onClick={() => prompt(Operator.EQUALS)}>Does not contain...</MenuItem>
      </SubMenu>
    );
  }

  function sort(desc: boolean): void {
    onChange(setSort(props.search, code, desc));
  }

  function clearFilters(): void {
    onChange(clearFiltersOnField(props.search, code));
  }

  /**
   * Prompts the user for a value to use in a filter.
   *
   * @param {Operator} op The filter operation.
   */
  function prompt(operator: Operator): void {
    props.onPrompt({ code, operator, value: '' });
  }

  function onChange(definition: SearchRequest): void {
    if (props.onChange) {
      props.onChange(definition);
    }
  }

  return (
    <Popup
      visible={props.visible}
      anchor={{ left: props.x, right: props.x, top: props.y, bottom: props.y } as DOMRectReadOnly}
      autoClose={true}
      onClose={props.onClose}
    >
      <MenuItem onClick={() => sort(false)}>{getAscSortString()}</MenuItem>
      <MenuItem onClick={() => sort(true)}>{getDescSortString()}</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => clearFilters()}>Clear filters</MenuItem>
      {renderSubMenu()}
      <MenuSeparator />
      <MenuItem onClick={() => prompt(props.searchParam?.type === 'reference' ? Operator.EQUALS : Operator.CONTAINS)}>
        Search
      </MenuItem>
    </Popup>
  );
}

import { IndexedStructureDefinition, SearchDefinition } from '@medplum/core';
import React from 'react';
import { MenuItem } from './MenuItem';
import { MenuSeparator } from './MenuSeparator';
import { PopupMenu } from './PopupMenu';
import { addFilter, buildFieldNameString, clearFiltersOnField, getOpString, setSort } from './SearchUtils';
import { SubMenu } from './SubMenu';

export interface SearchPopupMenuProps {
  schema: IndexedStructureDefinition;
  search: SearchDefinition;
  visible: boolean,
  x: number,
  y: number,
  field: string,
  onChange: (definition: SearchDefinition) => void,
  onClose: () => void
}

export function SearchPopupMenu(props: SearchPopupMenuProps) {
  const resourceType = props.search.resourceType;

  const typeDef = props.schema.types[resourceType];
  if (!typeDef) {
    return null;
  }

  const field = typeDef.properties[props.field];
  if (!field) {
    return null;
  }

  /**
   * Returns the string that represents the "sort ascending" operation.
   *
   * @param {string} fieldType The field type.
   * @return {string} The string that represents "sort ascending".
   */
  function getAscSortString_(fieldType: string) {
    switch (fieldType) {
      case 'date':
      case 'datetime':
        return 'Sort Oldest to Newest';
      case 'numeric':
        return 'Sort Smallest to Largest';
      default:
        return 'Sort A to Z';
    }
  }

  /**
   * Returns the string that represents the "sort descending" operation.
   *
   * @param {string} fieldType The field type.
   * @return {string} The string that represents "sort descending".
   */
  function getDescSortString_(fieldType: string) {
    switch (fieldType) {
      case 'date':
      case 'datetime':
        return 'Sort Newest to Oldest';
      case 'numeric':
        return 'Sort Largest to Smallest';
      default:
        return 'Sort Z to A';
    }
  }

  /**
   * Returns the submenu of specialized tools for a particular field type.
   *
   * @param {string} fieldType The field type.
   * @return {SubMenu} The new submenu.
   */
  function renderSubMenu_(fieldType: string) {
    switch (fieldType) {
      case 'date':
      case 'datetime':
        return renderDateTimeSubMenu_();

      case 'user':
      case 'organization':
      case 'site':
      case 'insurer':
        return null;

      default:
        return renderTextSubMenu_();
    }
  }

  /**
   * Returns the submenu of specialized tools for date/time fields.
   *
   * @return {SubMenu} The date/time submenu.
   */
  function renderDateTimeSubMenu_() {
    return (
      <SubMenu title="Date filters">
        <MenuItem onClick={() => prompt_('equals')}>Equals...</MenuItem>
        <MenuItem onClick={() => prompt_('equals')}>Does not equal...</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => prompt_('equals')}>Before...</MenuItem>
        <MenuItem onClick={() => prompt_('equals')}>After...</MenuItem>
        <MenuItem onClick={() => prompt_('equals')}>Between...</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => prompt_('equals')}>Tomorrow</MenuItem>
        <MenuItem onClick={() => prompt_('equals')}>Today</MenuItem>
        <MenuItem onClick={() => prompt_('equals')}>Yesterday</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => prompt_('equals')}>Next Month</MenuItem>
        <MenuItem onClick={() => prompt_('equals')}>This Month</MenuItem>
        <MenuItem onClick={() => prompt_('equals')}>Last Month</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => prompt_('equals')}>Year to date</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => prompt_('equals')}>Is set</MenuItem>
        <MenuItem onClick={() => prompt_('equals')}>Is not set</MenuItem>
      </SubMenu>
    );
  }

  /**
   * Returns the submenu of specialized tools for text fields.
   *
   * @return {SubMenu} The text field submenu.
   */
  function renderTextSubMenu_() {
    return (
      <SubMenu title="Text filters">
        <MenuItem onClick={() => prompt_('equals')}>Equals...</MenuItem>
        <MenuItem onClick={() => prompt_('not_equals')}>Does not equal...</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => prompt_('contains')}>Contains...</MenuItem>
        <MenuItem onClick={() => prompt_('not_contains')}>Does not contain...</MenuItem>
      </SubMenu>
    );
  }

  function sort(desc: boolean) {
    props.onChange(setSort(props.search, props.field, desc));
  }

  function clearFilters() {
    props.onChange(clearFiltersOnField(props.search, props.field));
  }

  /**
   * Prompts the user for a value to use in a filter.
   *
   * @param {string} op The filter operation.
   */
  function prompt_(op: string) {
    // setState({ visible: false });

    const caption = buildFieldNameString(props.schema, props.search.resourceType, props.field) + ' ' + getOpString(op) + '...';

    const retVal = prompt(caption, '');
    if (retVal !== null) {
      props.onChange(addFilter(props.search, props.field, op, retVal, true));
    }
  }

  return (
    <PopupMenu visible={props.visible} x={props.x} y={props.y} onClose={props.onClose}>
      <MenuItem onClick={() => sort(false)}>{getAscSortString_(field.type)}</MenuItem>
      <MenuItem onClick={() => sort(true)}>{getDescSortString_(field.type)}</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => clearFilters()}>Clear filters</MenuItem>
      {renderSubMenu_(field.type)}
      {field.type === 'string' && (
        <>
          <MenuSeparator />
          <MenuItem onClick={() => console.log('search')}>Search</MenuItem>
        </>
      )}
    </PopupMenu>
  );
}

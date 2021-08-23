import { ElementDefinition, IndexedStructureDefinition, Operator, SearchRequest } from '@medplum/core';
import React from 'react';
import { MenuItem } from './MenuItem';
import { MenuSeparator } from './MenuSeparator';
import { Popup } from './Popup';
import { addFilter, buildFieldNameString, clearFiltersOnField, getOpString, setSort } from './SearchUtils';
import { SubMenu } from './SubMenu';

export interface SearchPopupMenuProps {
  schema: IndexedStructureDefinition;
  search: SearchRequest;
  visible: boolean,
  x: number,
  y: number,
  property: string,
  onChange?: (definition: SearchRequest) => void,
  onClose: () => void
}

export function SearchPopupMenu(props: SearchPopupMenuProps) {
  const resourceType = props.search.resourceType;
  const property = getProperty();
  if (!property) {
    return null;
  }

  const propertyType = property.type?.[0]?.code;
  if (!propertyType) {
    return null;
  }

  /**
   * Returns the ElementDefinition for the property.
   * Handles some special cases (i.e., "meta.lastUpdated").
   * @returns The element definition, if found.
   */
  function getProperty(): ElementDefinition | undefined {
    if (props.property === 'meta.lastUpdated') {
      return {
        type: [{
          code: 'datetime'
        }]
      };
    }

    if (props.property === 'meta.versionId') {
      return {
        type: [{
          code: 'id'
        }]
      };
    }

    return props.schema.types[resourceType]?.properties?.[props.property];
  }

  /**
   * Returns the string that represents the "sort ascending" operation.
   *
   * @param {string} fieldType The property type.
   * @return {string} The string that represents "sort ascending".
   */
  function getAscSortString(fieldType: string) {
    switch (fieldType) {
      case 'date':
      case 'datetime':
        return 'Sort Oldest to Newest';
      case 'integer':
        return 'Sort Smallest to Largest';
      default:
        return 'Sort A to Z';
    }
  }

  /**
   * Returns the string that represents the "sort descending" operation.
   *
   * @param {string} fieldType The property type.
   * @return {string} The string that represents "sort descending".
   */
  function getDescSortString(fieldType: string) {
    switch (fieldType) {
      case 'date':
      case 'datetime':
        return 'Sort Newest to Oldest';
      case 'integer':
        return 'Sort Largest to Smallest';
      default:
        return 'Sort Z to A';
    }
  }

  /**
   * Returns the submenu of specialized tools for a particular property type.
   *
   * @param {string} fieldType The property type.
   * @return {SubMenu} The new submenu.
   */
  function renderSubMenu(fieldType: string) {
    switch (fieldType) {
      case 'date':
      case 'datetime':
        return renderDateTimeSubMenu();

      default:
        return renderTextSubMenu();
    }
  }

  /**
   * Returns the submenu of specialized tools for date/time fields.
   *
   * @return {SubMenu} The date/time submenu.
   */
  function renderDateTimeSubMenu() {
    return (
      <SubMenu title="Date filters">
        <MenuItem onClick={() => prompt(Operator.EQUALS)}>Equals...</MenuItem>
        <MenuItem onClick={() => prompt(Operator.NOT_EQUALS)}>Does not equal...</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => prompt(Operator.ENDS_BEFORE)}>Before...</MenuItem>
        <MenuItem onClick={() => prompt(Operator.STARTS_AFTER)}>After...</MenuItem>
        <MenuItem onClick={() => prompt(Operator.EQUALS)}>Between...</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => prompt(Operator.EQUALS)}>Tomorrow</MenuItem>
        <MenuItem onClick={() => prompt(Operator.EQUALS)}>Today</MenuItem>
        <MenuItem onClick={() => prompt(Operator.EQUALS)}>Yesterday</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => prompt(Operator.EQUALS)}>Next Month</MenuItem>
        <MenuItem onClick={() => prompt(Operator.EQUALS)}>This Month</MenuItem>
        <MenuItem onClick={() => prompt(Operator.EQUALS)}>Last Month</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => prompt(Operator.EQUALS)}>Year to date</MenuItem>
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
  function renderTextSubMenu() {
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

  function sort(desc: boolean) {
    onChange(setSort(props.search, props.property, desc));
  }

  function clearFilters() {
    onChange(clearFiltersOnField(props.search, props.property));
  }

  /**
   * Prompts the user for a value to use in a filter.
   *
   * @param {Operator} op The filter operation.
   */
  function prompt(op: Operator) {
    const caption = buildFieldNameString(props.schema, props.search.resourceType, props.property) + ' ' + getOpString(op) + '...';

    const retVal = window.prompt(caption, '');
    if (retVal !== null) {
      onChange(addFilter(props.search, props.property, op, retVal, true));
    }
  }

  function onChange(definition: SearchRequest): void {
    if (props.onChange) {
      props.onChange(definition);
    }
  }

  return (
    <Popup visible={props.visible} x={props.x} y={props.y} autoClose={true} onClose={props.onClose}>
      <MenuItem onClick={() => sort(false)}>{getAscSortString(propertyType)}</MenuItem>
      <MenuItem onClick={() => sort(true)}>{getDescSortString(propertyType)}</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => clearFilters()}>Clear filters</MenuItem>
      {renderSubMenu(propertyType)}
      {propertyType === 'string' && (
        <>
          <MenuSeparator />
          <MenuItem onClick={() => console.log('search')}>Search</MenuItem>
        </>
      )}
    </Popup>
  );
}

import React from 'react';
import { SearchDefinition } from '../model/Search';
import { schema } from '../schema';
import { MenuItem } from './MenuItem';
import { MenuSeparator } from './MenuSeparator';
import { PopupMenu } from './PopupMenu';
import { SubMenu } from './SubMenu';
import { sort, clearFiltersOnField, getOpString, getFieldString, addFilter } from './SearchUtils';

interface SearchPopupMenuProps {
  search: SearchDefinition;
  visible: boolean,
  x: number,
  y: number,
  field: string,
  onChange: (definition: SearchDefinition) => void,
  onClose: () => void
}

export class SearchPopupMenu extends React.Component<SearchPopupMenuProps, {}> {

  render() {
    const resourceType = this.props.search.resourceType;
    const typeDef = schema[resourceType];
    if (!typeDef) {
      return null;
    }

    const field = typeDef.properties[this.props.field];
    if (!field) {
      return null;
    }

    return (
      <PopupMenu visible={this.props.visible} x={this.props.x} y={this.props.y} onClose={this.props.onClose}>
        <MenuItem onClick={() => this.sort(false)}>{this.getAscSortString_(field.type)}</MenuItem>
        <MenuItem onClick={() => this.sort(true)}>{this.getDescSortString_(field.type)}</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => this.clearFilters()}>Clear filters</MenuItem>
        {this.renderSubMenu_(field.type)}
        {field.type === 'string' && (
          <>
            <MenuSeparator />
            <MenuItem onClick={() => console.log('search')}>Search</MenuItem>
          </>
        )}
      </PopupMenu>
    );
  }

  /**
   * Returns the string that represents the "sort ascending" operation.
   *
   * @param {string} fieldType The field type.
   * @return {string} The string that represents "sort ascending".
   */
  private getAscSortString_(fieldType: string) {
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
  private getDescSortString_(fieldType: string) {
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
  private renderSubMenu_(fieldType: string) {
    switch (fieldType) {
      case 'date':
      case 'datetime':
        return this.renderDateTimeSubMenu_();

      case 'user':
      case 'organization':
      case 'site':
      case 'insurer':
        return null;

      default:
        return this.renderTextSubMenu_();
    }
  }

  /**
   * Returns the submenu of specialized tools for date/time fields.
   *
   * @return {SubMenu} The date/time submenu.
   */
  private renderDateTimeSubMenu_() {
    return (
      <SubMenu title="Date filters">
        <MenuItem onClick={() => this.prompt_('equals')}>Equals...</MenuItem>
        <MenuItem onClick={() => this.prompt_('equals')}>Does not equal...</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => this.prompt_('equals')}>Before...</MenuItem>
        <MenuItem onClick={() => this.prompt_('equals')}>After...</MenuItem>
        <MenuItem onClick={() => this.prompt_('equals')}>Between...</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => this.prompt_('equals')}>Tomorrow</MenuItem>
        <MenuItem onClick={() => this.prompt_('equals')}>Today</MenuItem>
        <MenuItem onClick={() => this.prompt_('equals')}>Yesterday</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => this.prompt_('equals')}>Next Month</MenuItem>
        <MenuItem onClick={() => this.prompt_('equals')}>This Month</MenuItem>
        <MenuItem onClick={() => this.prompt_('equals')}>Last Month</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => this.prompt_('equals')}>Year to date</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => this.prompt_('equals')}>Is set</MenuItem>
        <MenuItem onClick={() => this.prompt_('equals')}>Is not set</MenuItem>
      </SubMenu>
    );
  }

  /**
   * Returns the submenu of specialized tools for text fields.
   *
   * @return {SubMenu} The text field submenu.
   */
  private renderTextSubMenu_() {
    return (
      <SubMenu title="Text filters">
        <MenuItem onClick={() => this.prompt_('equals')}>Equals...</MenuItem>
        <MenuItem onClick={() => this.prompt_('not_equals')}>Does not equal...</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => this.prompt_('contains')}>Contains...</MenuItem>
        <MenuItem onClick={() => this.prompt_('not_contains')}>Does not contain...</MenuItem>
      </SubMenu>
    );
  }

  private sort(desc: boolean) {
    this.props.onChange(sort(this.props.search, this.props.field, desc));
  }

  private clearFilters() {
    this.props.onChange(clearFiltersOnField(this.props.search, this.props.field));
  }

  /**
   * Prompts the user for a value to use in a filter.
   *
   * @param {string} op The filter operation.
   */
  private prompt_(op: string) {
    this.setState({ visible: false });

    var caption = getFieldString(this.props.field) + ' ' + getOpString(op) + '...';

    var retVal = prompt(caption, '');
    if (retVal !== null) {
      this.props.onChange(addFilter(this.props.search, this.props.field, op, retVal, true));
    }
  }
}

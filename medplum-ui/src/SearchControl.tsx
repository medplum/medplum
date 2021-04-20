import { FhirClient, schema, SearchDefinition, SearchFilterDefinition, SearchResponse } from 'medplum';
import React from 'react';
import { SearchChangeEvent, SearchClickEvent, SearchLoadEvent } from './SearchControlEvent';
import { SearchPopupMenu } from './SearchPopupMenu';
import './SearchControl.css';

/**
 * @desc Message displayed when there are no orders to show.
 * @type {string}
 */
// const MSG_NO_ORDERS = getMsg('No orders to show.');
const MSG_NO_ORDERS = 'No orders to show.';

/**
 * @desc Message displayed when there are no filters.
 * @type {string}
 */
// const MSG_NO_FILTERS = getMsg('no filters');
const MSG_NO_FILTERS = 'no filters';

interface SearchControlProps {
  search: SearchDefinition;
  checkboxColumnVisible?: boolean;
  onLoad: (e: SearchLoadEvent) => void;
  onChange: (e: SearchChangeEvent) => void;
  onClick: (e: SearchClickEvent) => void;
}

interface SearchControlState {
  searchResponse?: SearchResponse;
  allSelected: boolean;
  selected: { [id: string]: boolean };
  popupVisible: boolean;
  popupX: number;
  popupY: number;
  popupField: string;
}

/**
 * The SearchControl class represents the embeddable search table control.
 * It includes the table, rows, headers, sorting, etc.
 * It DOES NOT include the field editor, filter editor, pagination buttons.
 */
export class SearchControl extends React.Component<SearchControlProps, SearchControlState> {
  static defaultProps = {
    checkboxColumnVisible: true
  }

  constructor(props: SearchControlProps) {
    super(props);

    this.state = {
      allSelected: false,
      selected: {},
      popupVisible: false,
      popupX: 0,
      popupY: 0,
      popupField: ''
    };
  }

  render() {
    const checkboxColumn = this.props.checkboxColumnVisible;
    const fields = this.props.search.fields || [];
    const resourceType = this.props.search.resourceType;
    const entries = this.state.searchResponse?.entry || [];
    const resources = entries.map(e => e.resource);

    return (
      <div className="medplum-search-control" onContextMenu={e => this.handleContextMenu_(e)}>
        <table id="medplum-search-table">
          <thead>
            <tr>
              {checkboxColumn &&
                <th className="medplum-search-icon-cell">
                  <input
                    type="checkbox"
                    value="checked"
                    checked={this.state.allSelected}
                    onClick={e => this.handleAllCheckboxClick(e)}
                    onChange={() => { }}
                  />
                </th>
              }
              {fields.map(field =>
                <th
                  key={field}
                  data-key={field}
                  onClick={e => this.handleSortClick_(e)}
                >{SearchControl.buildFieldNameString(resourceType, field)}</th>
              )}
            </tr>
            <tr>
              {checkboxColumn &&
                <th className="filters medplum-search-icon-cell" />
              }
              {fields.map(field =>
                <th key={field} data-key={field} className="filters">{this.buildFilterString_(field)}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {resources.map(resource =>
              <tr
                key={resource.id}
                data-id={resource.id}
                className={resource.priority === 'High' ? "high-priority" : resource.status === 'Duplicate' ? "duplicate" : ""}
                onClick={e => this.handleRowClick_(e)}>
                {checkboxColumn &&
                  <td className="medplum-search-icon-cell">
                    <input
                      type="checkbox"
                      value="checked"
                      data-id={resource.id}
                      checked={!!this.state.selected[resource.id]}
                      onClick={e => this.handleSingleCheckboxClick(e)}
                      onChange={() => { }}
                    />
                  </td>
                }
                {this.props.search.fields?.map(field =>
                  <td key={field}>{this.renderValue(field, this.getValue(resource, field))}</td>
                )}
              </tr>
            )}
          </tbody>
        </table>
        {resources.length === 0 &&
          <div className="medplum-empty-search">{MSG_NO_ORDERS}</div>}
        <SearchPopupMenu
          search={this.props.search}
          visible={this.state.popupVisible}
          x={this.state.popupX}
          y={this.state.popupY}
          field={this.state.popupField}
          onChange={definition => {
            this.fireChangeEvent_(definition);
            this.setState({ popupVisible: false, popupField: '' });
          }}
          onClose={() => this.setState({ popupVisible: false, popupField: '' })}
        />
      </div>
    );
  }

  componentDidMount() {
    this.requestResources();
  }

  componentDidUpdate(prevProps: SearchControlProps) {
    if (JSON.stringify(prevProps.search) !== JSON.stringify(this.props.search)) {
      this.requestResources();
    }
  }

  private requestResources() {
    FhirClient.search(this.props.search)
      .then(response => {
        this.setState({ searchResponse: response as SearchResponse });
        this.fireLoadEvent_(response as SearchResponse);
      });
  }

  static buildFieldNameString(resourceType: string, key: string): string {
    const typeDef = schema[resourceType];
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
   * Builds a string for a filter that can be used in the "filters" row.
   *
   * @param {string} key The key for the current field/column.
   * @return {string} The HTML snippet for a "filters" cell.
   */
  private buildFilterString_(key: string) {
    const filters = this.props.search.filters.filter(f => f.key === key);
    if (filters.length === 0) {
      return <span className="muted">no filters</span>;
    }

    return filters.map(f => this.getFilterValueString(f)).join('<br>');
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
  getFilterValueString(filter: SearchFilterDefinition) {
    let value = filter.value;
    if (!value) {
      return <span className="muted">none</span>;
    }

    var chunks = value.split(';');
    return chunks.map((c: string) => '"' + c + '"').join(' or ');
  }

  /**
   * Returns one of the meta fields.
   *
   * @param {!string} key The field key.
   * @return {*} The value.
   */
  getValue(resource: any, key: string) {
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
  renderValue(key: string, value: any): string | JSX.Element {
    if (!value) {
      return <span className="muted">none</span>;
    }

    if (key === 'id' || key === 'meta.lastUpdated' || key === 'meta.versionId') {
      return value;
    }

    const typeDef = schema[this.props.search.resourceType];
    if (!typeDef) {
      return JSON.stringify(value);
    }

    const field = typeDef.properties[key];
    if (!field) {
      return JSON.stringify(value);
    }

    if (field.type === 'HumanName') {
      let result = '';
      if (value && value.length > 0) {
        const name = value[0];
        if (name.prefix) {
          result = name.prefix;
        }
        if (name.given) {
          result += ' ' + name.given.join(' ');
        }
        if (name.family) {
          result += ' ' + name.family;
        }
        if (name.suffix) {
          result += ' ' + name.suffix;
        }
      }
      return result;
    }

    // if (field['type'] === 'name') {
    //   var pn = new PersonName(/** @type {!string} */(value));
    //   return pn.getDisplayString();
    // }

    // if (field['type'] === 'user') {
    //   var pn = new PersonName(/** @type {!string} */(value['name']));
    //   return pn.getDisplayString();
    // }

    if (field['type'] === 'map') {
      return JSON.stringify(value);
    }

    return JSON.stringify(value);
  }

  private killEvent(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  private handleSingleCheckboxClick(e: React.MouseEvent) {
    // this.killEvent(e);
    e.stopPropagation();

    const el = e.currentTarget as HTMLInputElement;
    const checked = el.checked;
    const id = el.dataset['id'];
    if (id) {
      const newSelected = { ...this.state.selected };
      if (checked) {
        newSelected[id] = true;
      } else {
        delete newSelected[id];
      }
      this.setState({ selected: newSelected })
    }
  }

  private handleAllCheckboxClick(e: React.MouseEvent) {
    // this.killEvent(e);
    e.stopPropagation();

    const el = e.currentTarget as HTMLInputElement;
    const checked = el.checked;
    const newSelected = {} as { [id: string]: boolean };
    if (checked) {
      const entries = this.state.searchResponse?.entry || [];
      const resources = entries.map(e => e.resource);
      resources.forEach(r => newSelected[r.id] = checked);
    }
    this.setState({ allSelected: checked, selected: newSelected });
    return true;
  }

  /**
   * Handles a click on a column header cell.
   *
   * @param {MouseEvent} e The click event.
   */
  handleSortClick_(e: React.MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const key = el.dataset['key'];
    if (key) {
      this.setState({ popupVisible: true, popupX: e.clientX, popupY: e.clientY, popupField: key });
    }
  }

  /**
   * Handles a click on a order row.
   *
   * @param {MouseEvent} e The click event.
   * @param {Element} el The click target element.
   * @return {boolean} True to allow default behavior; false to cancel.
   */
  private handleRowClick_(e: React.MouseEvent) {
    this.killEvent(e);

    const el = e.currentTarget as HTMLElement;
    const id = el.dataset['id'];
    if (id) {
      this.fireClickEvent_(id, e);
    }

    return false;
  }

  /**
   * Handles a "context menu" event, which is the defualt right click event.
   *
   * @param {Event} e The click event.
   * @return {boolean} True to allow default behavior; false to cancel.
   */
  private handleContextMenu_(e: React.MouseEvent) {
    this.killEvent(e);

    // Return false to disable context menu
    // http://stackoverflow.com/questions/381795/how-to-disable-right-click-context-menu-in-javascript
    return false;
  }

  /**
   * Fires a 'change' event.
   */
  private fireChangeEvent_(definition: SearchDefinition) {
    if (this.props.onChange) {
      this.props.onChange(new SearchChangeEvent(definition));
    }
  }

  /**
   * Fires a 'load' event.
   */
  private fireLoadEvent_(response: SearchResponse) {
    if (this.props.onLoad) {
      this.props.onLoad(new SearchLoadEvent(response));
    }
  }

  /**
   * Fires a 'click' event.
   *
   * @param {string} entityId The order ID.
   * @param {Event} browserEvent Browser event.
   */
  fireClickEvent_(entityId: string, browserEvent: React.MouseEvent) {
    if (this.props.onClick) {
      this.props.onClick(new SearchClickEvent(entityId, browserEvent));
    }
  }

  /**
   * Returns the selected text.
   *
   * @return {string} The selected text.
   */
  getSelectedText_() {
    const selection = window.getSelection();
    if (!selection) {
      return '';
    }
    return selection.toString();
  }
}

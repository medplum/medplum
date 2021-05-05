import { Resource, schema, SearchDefinition, SearchFilterDefinition, SearchResponse } from 'medplum';
import React, { useEffect, useRef, useState } from 'react';
import { useMedplum } from './MedplumProvider';
import { SearchPopupMenu } from './SearchPopupMenu';
import { buildFieldNameString } from './SearchUtils';
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

export class SearchChangeEvent extends Event {
  readonly definition: SearchDefinition;

  constructor(definition: SearchDefinition) {
    super('change');
    this.definition = definition;
  }
}

export class SearchLoadEvent extends Event {
  readonly response: SearchResponse;

  constructor(response: SearchResponse) {
    super('load');
    this.response = response;
  }
}

export class SearchClickEvent extends Event {
  readonly resource: Resource;
  readonly browserEvent: React.MouseEvent;

  constructor(resource: Resource, browserEvent: React.MouseEvent) {
    super('click');
    this.resource = resource;
    this.browserEvent = browserEvent;
  }
}


export interface SearchControlProps {
  search: SearchDefinition;
  checkboxesEnabled?: boolean;
  onLoad?: (e: SearchLoadEvent) => void;
  onChange?: (e: SearchChangeEvent) => void;
  onClick?: (e: SearchClickEvent) => void;
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
export function SearchControl(props: SearchControlProps) {
  const medplum = useMedplum();

  const [state, setState] = useState<SearchControlState>({
    allSelected: false,
    selected: {},
    popupVisible: false,
    popupX: 0,
    popupY: 0,
    popupField: ''
  });

  const stateRef = useRef<SearchControlState>(state);
  stateRef.current = state;

  function requestResources() {
    medplum.search(props.search)
      .then(response => {
        const state = stateRef.current;
        setState({ ...state, searchResponse: response as SearchResponse });
        if (props.onLoad) {
          props.onLoad(new SearchLoadEvent(response));
        }
      });
  }

  /**
   * Builds a string for a filter that can be used in the "filters" row.
   *
   * @param {string} key The key for the current field/column.
   * @return {string} The HTML snippet for a "filters" cell.
   */
  function buildFilterString_(key: string) {
    const filters = (props.search.filters ?? []).filter(f => f.key === key);
    if (filters.length === 0) {
      return <span className="muted">no filters</span>;
    }

    return filters.map(f => getFilterValueString(f)).join('<br>');
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
  function getFilterValueString(filter: SearchFilterDefinition) {
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
  function getValue(resource: any, key: string) {
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
  function renderValue(key: string, value: any): string | JSX.Element {
    if (!value) {
      return <span className="muted">none</span>;
    }

    if (key === 'id' || key === 'meta.lastUpdated' || key === 'meta.versionId') {
      return value;
    }

    const typeDef = schema[props.search.resourceType];
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

  function handleSingleCheckboxClick(e: React.MouseEvent) {
    // killEvent(e);
    e.stopPropagation();

    const el = e.currentTarget as HTMLInputElement;
    const checked = el.checked;
    const id = el.dataset['id'];
    if (id) {
      const state = stateRef.current;
      const newSelected = { ...state.selected };
      if (checked) {
        newSelected[id] = true;
      } else {
        delete newSelected[id];
      }
      setState({ ...state, selected: newSelected })
    }
  }

  function handleAllCheckboxClick(e: React.MouseEvent) {
    // killEvent(e);
    e.stopPropagation();

    const el = e.currentTarget as HTMLInputElement;
    const checked = el.checked;
    const newSelected = {} as { [id: string]: boolean };
    const state = stateRef.current;
    if (checked) {
      const entries = state.searchResponse?.entry || [];
      const resources = entries.map(e => e.resource);
      resources.forEach(r => newSelected[r.id] = checked);
    }
    setState({ ...state, allSelected: checked, selected: newSelected });
    return true;
  }

  /**
   * Handles a click on a column header cell.
   *
   * @param {MouseEvent} e The click event.
   */
  function handleSortClick_(e: React.MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const key = el.dataset['key'];
    console.log('cody handle sort click', el, key);
    if (key) {
      const state = stateRef.current;
      setState({
        ...state,
        popupVisible: true,
        popupX: e.clientX,
        popupY: e.clientY,
        popupField: key
      });
    }
  }

  /**
   * Handles a click on a order row.
   *
   * @param {MouseEvent} e The click event.
   * @param {Element} el The click target element.
   */
  function handleRowClick_(e: React.MouseEvent) {
    killEvent(e);

    const el = e.currentTarget as HTMLElement;
    const id = el.dataset['id'];
    if (id) {
      if (props.onClick) {
        const entries = state.searchResponse?.entry || [];
        const resources = entries.map(e => e.resource);
        const resource = resources.find(r => r.id === id);
        props.onClick(new SearchClickEvent(resource, e));
      }
    }
  }

  useEffect(() => requestResources(), [props.search]);

  const checkboxColumn = props.checkboxesEnabled;
  const fields = props.search.fields || ['id', 'meta.lastUpdated', 'name'];
  const resourceType = props.search.resourceType;
  const entries = state.searchResponse?.entry || [];
  const resources = entries.map(e => e.resource);

  return (
    <div className="medplum-search-control" onContextMenu={e => killEvent(e)}>
      <table id="medplum-search-table">
        <thead>
          <tr>
            {checkboxColumn &&
              <th className="medplum-search-icon-cell">
                <input
                  type="checkbox"
                  value="checked"
                  checked={state.allSelected}
                  onClick={e => handleAllCheckboxClick(e)}
                  onChange={() => { }}
                />
              </th>
            }
            {fields.map(field =>
              <th
                key={field}
                data-key={field}
                onClick={e => handleSortClick_(e)}
              >{buildFieldNameString(resourceType, field)}</th>
            )}
          </tr>
          <tr>
            {checkboxColumn &&
              <th className="filters medplum-search-icon-cell" />
            }
            {fields.map(field =>
              <th key={field} data-key={field} className="filters">{buildFilterString_(field)}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {resources.map(resource =>
            <tr
              key={resource.id}
              data-id={resource.id}
              className={resource.priority === 'High' ? "high-priority" : resource.status === 'Duplicate' ? "duplicate" : ""}
              onClick={e => handleRowClick_(e)}>
              {checkboxColumn &&
                <td className="medplum-search-icon-cell">
                  <input
                    type="checkbox"
                    value="checked"
                    data-id={resource.id}
                    checked={!!state.selected[resource.id]}
                    onClick={e => handleSingleCheckboxClick(e)}
                    onChange={() => { }}
                  />
                </td>
              }
              {fields.map(field =>
                <td key={field}>{renderValue(field, getValue(resource, field))}</td>
              )}
            </tr>
          )}
        </tbody>
      </table>
      {resources.length === 0 &&
        <div className="medplum-empty-search">{MSG_NO_ORDERS}</div>}
      <SearchPopupMenu
        search={props.search}
        visible={state.popupVisible}
        x={state.popupX}
        y={state.popupY}
        field={state.popupField}
        onChange={definition => {
          if (props.onChange) {
            props.onChange(new SearchChangeEvent(definition));
          }
          const state = stateRef.current;
          setState({
            ...state,
            popupVisible: false,
            popupField: ''
          });
        }}
        onClose={() => {
          const state = stateRef.current;
          setState({
            ...state,
            popupVisible: false,
            popupField: ''
          });
        }}
      />
    </div>
  );
}

function killEvent(e: React.SyntheticEvent) {
  e.preventDefault();
  e.stopPropagation();
}

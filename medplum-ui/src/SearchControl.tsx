import { Bundle, IndexedStructureDefinition, Resource, SearchDefinition } from 'medplum';
import React, { useEffect, useRef, useState } from 'react';
import { useMedplum } from './MedplumProvider';
import { SearchPopupMenu } from './SearchPopupMenu';
import { buildFieldNameString, getFilterValueString, getValue, renderValue } from './SearchUtils';
import './SearchControl.css';

export class SearchChangeEvent extends Event {
  readonly definition: SearchDefinition;

  constructor(definition: SearchDefinition) {
    super('change');
    this.definition = definition;
  }
}

export class SearchLoadEvent extends Event {
  readonly response: Bundle;

  constructor(response: Bundle) {
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
  searchResponse?: Bundle;
  allSelected: boolean;
  selected: { [id: string]: boolean };
  popupVisible: boolean;
  popupX: number;
  popupY: number;
  popupField: string;
}

/**
 * The SearchControl component represents the embeddable search table control.
 * It includes the table, rows, headers, sorting, etc.
 * It does not include the field editor, filter editor, pagination buttons.
 */
export function SearchControl(props: SearchControlProps) {
  const medplum = useMedplum();
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();

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
        setState({ ...stateRef.current, searchResponse: response as Bundle });
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

  function handleSingleCheckboxClick(e: React.MouseEvent) {
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
    e.stopPropagation();

    const el = e.currentTarget as HTMLInputElement;
    const checked = el.checked;
    const newSelected = {} as { [id: string]: boolean };
    const state = stateRef.current;
    if (checked && state.searchResponse?.entry) {
      state.searchResponse.entry.forEach(e => {
        if (e.resource?.id) {
          newSelected[e.resource.id] = true;
        }
      });
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
    if (key) {
      setState({
        ...stateRef.current,
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
    if (id && props.onClick && state.searchResponse?.entry) {
      const entry = state.searchResponse.entry.find(e => e.resource?.id === id);
      if (entry?.resource) {
        props.onClick(new SearchClickEvent(entry.resource, e));
      }
    }
  }

  useEffect(() => {
    medplum.getTypeDefinition(props.search.resourceType).then(schema => setSchema(schema));
  }, [props.search.resourceType]);

  useEffect(() => requestResources(), [props.search]);

  if (!schema) {
    return (
      <div>Loading</div>
    );
  }

  const checkboxColumn = props.checkboxesEnabled;
  const fields = props.search.fields || ['id', 'meta.lastUpdated', 'name'];
  const resourceType = props.search.resourceType;
  const entries = state.searchResponse?.entry || [];
  const resources = entries.map(e => e.resource);

  return (
    <div className="medplum-search-control" onContextMenu={e => killEvent(e)}>
      <table>
        <thead>
          <tr>
            {checkboxColumn &&
              <th className="medplum-search-icon-cell">
                <input
                  type="checkbox"
                  value="checked"
                  defaultChecked={state.allSelected}
                  onClick={e => handleAllCheckboxClick(e)}
                />
              </th>
            }
            {fields.map(field =>
              <th
                key={field}
                data-key={field}
                onClick={e => handleSortClick_(e)}
              >{buildFieldNameString(schema, resourceType, field)}</th>
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
          {resources.map(resource => (resource &&
            <tr
              key={resource.id}
              data-id={resource.id}
              onClick={e => handleRowClick_(e)}>
              {checkboxColumn &&
                <td className="medplum-search-icon-cell">
                  <input
                    type="checkbox"
                    value="checked"
                    data-id={resource.id}
                    defaultChecked={!!(resource.id && state.selected[resource.id])}
                    onClick={e => handleSingleCheckboxClick(e)}
                  />
                </td>
              }
              {fields.map(field =>
                <td key={field}>{renderValue(schema, props.search.resourceType, field, getValue(resource, field))}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {resources.length === 0 &&
        <div className="medplum-empty-search">No results</div>}
      <SearchPopupMenu
        schema={schema}
        search={props.search}
        visible={state.popupVisible}
        x={state.popupX}
        y={state.popupY}
        field={state.popupField}
        onChange={definition => {
          if (props.onChange) {
            props.onChange(new SearchChangeEvent(definition));
          }
          setState({
            ...stateRef.current,
            popupVisible: false,
            popupField: ''
          });
        }}
        onClose={() => {
          setState({
            ...stateRef.current,
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

import { Bundle, IndexedStructureDefinition, Resource, SearchRequest } from '@medplum/core';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Loading } from './Loading';
import { useMedplum, useMedplumRouter } from './MedplumProvider';
import { SearchFieldEditor } from './SearchFieldEditor';
import { SearchFilterEditor } from './SearchFilterEditor';
import { SearchPopupMenu } from './SearchPopupMenu';
import { buildFieldNameString, getFilterValueString, getValue, movePage, renderValue } from './SearchUtils';
import { killEvent } from './utils/dom';
import './SearchControl.css';

export class SearchChangeEvent extends Event {
  readonly definition: SearchRequest;

  constructor(definition: SearchRequest) {
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
  search: SearchRequest;
  checkboxesEnabled?: boolean;
  onLoad?: (e: SearchLoadEvent) => void;
  onChange?: (e: SearchChangeEvent) => void;
  onClick?: (e: SearchClickEvent) => void;
}

interface SearchControlState {
  searchResponse?: Bundle;
  selected: { [id: string]: boolean };
  popupVisible: boolean;
  popupX: number;
  popupY: number;
  popupField: string;
  fieldEditorVisible: boolean;
  filterEditorVisible: boolean;
}

/**
 * The SearchControl component represents the embeddable search table control.
 * It includes the table, rows, headers, sorting, etc.
 * It does not include the field editor, filter editor, pagination buttons.
 */
export function SearchControl(props: SearchControlProps) {
  const medplum = useMedplum();
  const router = useMedplumRouter();
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();

  const [state, setState] = useState<SearchControlState>({
    selected: {},
    popupVisible: false,
    popupX: 0,
    popupY: 0,
    popupField: '',
    fieldEditorVisible: false,
    filterEditorVisible: false
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
  function buildFilterString(key: string) {
    const filters = (props.search.filters ?? []).filter(f => f.code === key);
    if (filters.length === 0) {
      return <span className="muted">no filters</span>;
    }

    return filters.map(f => getFilterValueString(f)).join('<br>');
  }

  function handleSingleCheckboxClick(e: React.ChangeEvent) {
    e.stopPropagation();

    const el = e.target as HTMLInputElement;
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

  function handleAllCheckboxClick(e: React.ChangeEvent) {
    e.stopPropagation();

    const el = e.target as HTMLInputElement;
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
    setState({ ...state, selected: newSelected });
    return true;
  }

  function isAllSelected() {
    const state = stateRef.current;
    if (!state.searchResponse?.entry || state.searchResponse.entry.length === 0) {
      return false;
    }
    for (const e of state.searchResponse.entry) {
      if (e.resource?.id && !state.selected[e.resource.id]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Handles a click on a column header cell.
   *
   * @param {MouseEvent} e The click event.
   */
  function handleSortClick(e: React.MouseEvent) {
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
   * Emits a change event to the optional change listener.
   * @param newSearch The new search definition.
   */
  function emitSearchChange(newSearch: SearchRequest): void {
    if (props.onChange) {
      props.onChange(new SearchChangeEvent(newSearch));
    }
  }

  /**
   * Handles a click on a order row.
   *
   * @param {MouseEvent} e The click event.
   * @param {Element} el The click target element.
   */
  function handleRowClick(e: React.MouseEvent) {
    if (e.target instanceof HTMLInputElement && e.target.type === 'checkbox') {
      // Ignore clicks on checkboxes
      return;
    }

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
    return <Loading />;
  }

  const checkboxColumn = props.checkboxesEnabled;
  const search = props.search;
  const fields = search.fields || ['id', 'meta.lastUpdated', 'name'];
  const resourceType = search.resourceType;
  const lastResult = state.searchResponse;
  const entries = lastResult?.entry;
  const resources = entries?.map(e => e.resource);

  return (
    <div
      className="medplum-search-control"
      onContextMenu={e => killEvent(e)}
      data-testid="search-control"
    >
      <div className="medplum-search-control-toolbar">
        <div style={{ display: 'flex' }}>
          <Button
            testid="fields-button"
            size="small"
            onClick={() => setState({ ...stateRef.current, fieldEditorVisible: true })}
          >Fields</Button>
          <Button
            testid="filters-button"
            size="small"
            onClick={() => setState({ ...stateRef.current, filterEditorVisible: true })}
          >Filters</Button>
          <Button
            testid="export-button"
            size="small"
          >Export</Button>
          <Button
            testid="new-button"
            size="small"
            onClick={() => router.push(`/${resourceType}/new`)}
          >New...</Button>
        </div>
        {lastResult && (
          <div style={{ display: 'flex' }}>
            <span style={{ lineHeight: '28px', padding: '2px 6px', fontSize: '12px' }}>
              {getStart(search, lastResult.total as number)}-{getEnd(search, lastResult.total as number)} of {lastResult.total}
            </span>
            <Button
              testid="prev-page-button"
              size="small"
              onClick={() => emitSearchChange(movePage(search, -1))}
            >&lt;&lt;</Button>
            <Button
              testid="next-page-button"
              size="small"
              onClick={() => emitSearchChange(movePage(search, 1))}
            >&gt;&gt;</Button>
          </div>
        )}
      </div>
      <table>
        <thead>
          <tr>
            {checkboxColumn &&
              <th className="medplum-search-icon-cell">
                <input
                  type="checkbox"
                  value="checked"
                  checked={isAllSelected()}
                  onChange={e => handleAllCheckboxClick(e)}
                />
              </th>
            }
            {fields.map(field =>
              <th
                key={field}
                data-key={field}
                onClick={e => handleSortClick(e)}
              >{buildFieldNameString(schema, resourceType, field)}</th>
            )}
          </tr>
          <tr>
            {checkboxColumn &&
              <th className="filters medplum-search-icon-cell" />
            }
            {fields.map(field =>
              <th key={field} data-key={field} className="filters">{buildFilterString(field)}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {resources?.map(resource => (resource &&
            <tr
              key={resource.id}
              data-id={resource.id}
              data-testid="search-control-row"
              onClick={e => handleRowClick(e)}>
              {checkboxColumn &&
                <td className="medplum-search-icon-cell">
                  <input
                    type="checkbox"
                    value="checked"
                    data-id={resource.id}
                    checked={!!(resource.id && state.selected[resource.id])}
                    onChange={e => handleSingleCheckboxClick(e)}
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
      {resources?.length === 0 && (
        <div data-testid="empty-search" className="medplum-empty-search">No results</div>
      )}
      <SearchPopupMenu
        schema={schema}
        search={props.search}
        visible={state.popupVisible}
        x={state.popupX}
        y={state.popupY}
        field={state.popupField}
        onChange={result => {
          emitSearchChange(result);
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
      <SearchFieldEditor
        schema={schema}
        search={props.search}
        visible={stateRef.current.fieldEditorVisible}
        onOk={result => {
          emitSearchChange(result);
          setState({
            ...stateRef.current,
            fieldEditorVisible: false
          });
        }}
        onCancel={() => {
          setState({
            ...stateRef.current,
            fieldEditorVisible: false
          });
        }}
      />
      <SearchFilterEditor
        schema={schema}
        search={props.search}
        visible={stateRef.current.filterEditorVisible}
        onOk={result => {
          emitSearchChange(result);
          setState({
            ...stateRef.current,
            filterEditorVisible: false
          });
        }}
        onCancel={() => {
          setState({
            ...stateRef.current,
            filterEditorVisible: false
          });
        }}
      />
    </div>
  );
}

function getStart(search: SearchRequest, total: number): number {
  return Math.min(total, (search.page ?? 0) * (search.count ?? 10) + 1);
}

function getEnd(search: SearchRequest, total: number): number {
  return Math.min(total, ((search.page ?? 0) + 1) * (search.count ?? 10));
}

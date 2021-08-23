import { Filter, IndexedStructureDefinition, Operator, SearchParameter, SearchRequest, stringify } from '@medplum/core';
import React, { useState } from 'react';
import { Dialog } from './Dialog';
import { ReferenceInput } from './ReferenceInput';
import { addFilter, deleteFilter } from './SearchUtils';

interface FilterRowProps {
  schema: IndexedStructureDefinition;
  resourceType: string;
  filter: Filter;
  editing: boolean;
  onAdd: (filter: Filter) => void;
  onDelete: (filter: Filter) => void;
}

function FilterRow(props: FilterRowProps) {
  const [editing, setEditing] = useState<boolean>(props.editing);
  const [searchParam, setSearchParam] = useState<SearchParameter>();
  const [operator, setOperator] = useState<Operator>(Operator.EQUALS);
  const [value, setValue] = useState<string>('');

  function renderField() {
    const resourceType = props.resourceType;
    const searchParams = props.schema.types[resourceType].searchParams as SearchParameter[];
    return (
      <select defaultValue={searchParam?.code} onChange={e => setSearchParam(searchParams.find(p => p.code === e.target.value))}>
        <option value=""></option>
        {searchParams.map(param => (
          <option key={param.code} value={param.code}>{param.code}</option>
        ))}
      </select>
    );
  }

  function renderOperation() {
    if (!searchParam) {
      return null;
    }

    return (
      <select defaultValue={operator} onChange={e => setOperator(e.target.value as Operator)}>
        {renderOperationOptions(searchParam)}
      </select>
    );
  }

  function renderOperationOptions(param: SearchParameter) {
    switch (param.type) {
      case 'string':
      case 'fulltext':
      case 'token':
        return (
          <>
            <option value=""></option>
            <option value="equals">Is</option>
            <option value="not_equals">Is not</option>
            <option value="contains">Contains</option>
            <option value="not_contains">Does not contain</option>
          </>
        );

      case 'numeric':
        return (
          <>
            <option value=""></option>
            <option value="equals">Equalsa</option>
            <option value="not_equals">Not equals</option>
          </>
        );

      case 'date':
      case 'datetime':
        return (
          <>
            <option value=""></option>
            <option value="equals">Is</option>
            <option value="before_datetime">Before date/time</option>
            <option value="after_datetime">After date/time</option>
            <option value="newer_than_interval">Newer than</option>
            <option value="older_than_interval">Older than</option>
            <option value="is_set">Is set</option>
            <option value="is_not_set">Is not set</option>
          </>
        );

      case 'reference':
        return (
          <>
            <option value=""></option>
            <option value="equals">Is</option>
            <option value="not_equals">Is not</option>
          </>
        );

      case 'bool':
        return (
          <>
            <option value=""></option>
            <option value="is_set">Is set</option>
            <option value="is_not_set">Is not set</option>
          </>
        );

      default:
        console.log('WARNING: Unhandled search parameter type: ' + param.type);
    }
  }

  function renderValue() {
    if (!searchParam || !operator) {
      return null;
    }

    switch (searchParam.type) {
      case 'string':
      case 'fulltext':
      case 'token':
        return (
          <input type="text" onChange={e => setValue(e.target.value)} />
        );

      case 'numeric':
        return (
          <input type="text" onChange={e => setValue(e.target.value)} />
        );

      case 'date':
        return (
          <input type="date" step="1" defaultValue="" onChange={e => {
            setValue(e.target.value);
          }} />
        );

      case 'datetime':
        return (
          <input type="datetime-local" step="1" defaultValue="" onChange={e => {
            setValue(e.target.value);
          }} />
        );

      case 'reference':
        return (
          <ReferenceInput name="reference" onChange={e => setValue(e?.reference || '')} />
        );

      case 'bool':
        return (
          <input type="text" onChange={e => setValue(e.target.value)} />
        );
    }
  }

  function onAddClick(): void {
    if (!searchParam || !operator) {
      return;
    }

    props.onAdd({
      code: searchParam.code as string,
      operator,
      value
    });

    setSearchParam(undefined);
    setOperator(Operator.EQUALS);
    setValue('');
  }

  if (!editing) {
    const filter = props.filter;
    return (
      <tr>
        <td>{filter.code}</td>
        <td>{filter.operator}</td>
        <td>{filter.value}</td>
        <td>
          <button
            className="btn btn-small"
            onClick={() => setEditing(true)}
          >Edit</button>
          <button
            className="btn btn-small"
            onClick={() => props.onDelete(filter)}
          >Delete</button>
        </td>
      </tr>
    );
  }

  // Otherwise, we're editing:
  return (
    <tr>
      <td>{renderField()}</td>
      <td>{renderOperation()}</td>
      <td>{renderValue()}</td>
      <td>
        <button
          className="btn btn-small"
          onClick={() => onAddClick()}
        >Add</button>
        <button
          className="btn btn-small"
          onClick={() => setEditing(false)}
        >Cancel</button>
      </td>
    </tr>
  );
}

export interface SearchFilterEditorProps {
  schema: IndexedStructureDefinition;
  visible: boolean;
  search: SearchRequest;
  onOk: (search: SearchRequest) => void;
  onCancel: () => void;
}

export function SearchFilterEditor(props: SearchFilterEditorProps) {
  const [state, setState] = useState({
    search: JSON.parse(stringify(props.search)) as SearchRequest
  });

  function onAddFilter(filter: Filter) {
    setState({ search: addFilter(state.search, filter.code, filter.operator, filter.value) });
  }

  function onDeleteFilter(filter: Filter) {
    if (!state.search.filters) {
      return;
    }
    const index = state.search.filters.findIndex(f => Object.is(f, filter));
    setState({ search: deleteFilter(state.search, index) });
  }

  if (!props.visible) {
    return null;
  }

  const filters = state.search.filters || [];

  return (
    <Dialog
      visible={props.visible}
      onOk={() => props.onOk(state.search)}
      onCancel={props.onCancel}>
      <div className="medplum-filter-editor">
        <table className="medplum-filter-editor-table">
          <thead>
            <tr>
              <th style={{ width: '235px' }}>Field</th>
              <th style={{ width: '120px' }}>Operation</th>
              <th style={{ width: '400px' }}>Value</th>
              <th style={{ width: '120px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filters.map((filter: Filter) => (
              <FilterRow
                schema={props.schema}
                resourceType={props.search.resourceType}
                key={stringify(filter)}
                filter={filter}
                editing={false}
                onAdd={f => onAddFilter(f)}
                onDelete={f => onDeleteFilter(f)}
              />
            ))}
            <FilterRow
              schema={props.schema}
              resourceType={props.search.resourceType}
              filter={{ code: '', operator: Operator.EQUALS, value: '' }}
              editing={true}
              onAdd={f => onAddFilter(f)}
              onDelete={f => onDeleteFilter(f)}
            />
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

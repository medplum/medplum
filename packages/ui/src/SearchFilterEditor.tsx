import { IndexedStructureDefinition, SearchDefinition, SearchFilterDefinition } from '@medplum/core';
import React, { useRef, useState } from 'react';
import { Autocomplete } from './Autocomplete';
import { Dialog } from './Dialog';
import { addFilter, buildFieldNameString, deleteFilter, getOpString } from './SearchUtils';

interface FilterRowProps {
  schema: IndexedStructureDefinition;
  resourceType: string;
  definition: SearchFilterDefinition;
  onAdd: (filter: SearchFilterDefinition) => void;
  onDelete: (filter: SearchFilterDefinition) => void;
}

function FilterRow(props: FilterRowProps) {
  const [state, setState] = useState({
    editing: props.definition.key === '',
    field: props.definition.key,
    op: props.definition.op,
    value: props.definition.value
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  function renderField() {
    const resourceType = props.resourceType;
    const typeSchema = props.schema.types[resourceType];
    return (
      <select defaultValue={state.field} onChange={e => setState({ ...stateRef.current, field: e.target.value })}>
        <option value=""></option>
        {Object.values(typeSchema.properties)
          .sort((a, b) => (a.display > b.display) ? 1 : -1)
          .map(field => (
            <option key={field.key} value={field.key}>{buildFieldNameString(props.schema, resourceType, field.key)}</option>
          ))}
      </select>
    );
  }

  function renderOperation() {
    if (!state.field) {
      return null;
    }

    return (
      <select defaultValue={state.op} onChange={e => setState({ ...stateRef.current, op: e.target.value })}>
        {renderOperationOptions()}
      </select>
    );
  }

  function renderOperationOptions() {
    const fieldKey = state.field;
    if (!fieldKey) {
      return null;
    }

    const typeSchema = props.schema.types[props.resourceType];
    if (!typeSchema) {
      return null;
    }

    const fieldDefinition = typeSchema.properties[fieldKey];
    if (!fieldDefinition) {
      return null;
    }

    switch (fieldDefinition.type) {
      case 'string':
      case 'fulltext':
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

      case 'enum':
      case 'user':
      case 'organization':
      case 'site':
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
    }
  }

  function renderValue() {
    const fieldKey = state.field;
    if (!fieldKey) {
      return null;
    }

    const typeSchema = props.schema.types[props.resourceType];
    if (!typeSchema) {
      return null;
    }

    const fieldDefinition = typeSchema.properties[fieldKey];
    if (!fieldDefinition) {
      return null;
    }

    const op = state.op;
    if (!op) {
      return null;
    }

    switch (fieldDefinition.type) {
      case 'string':
      case 'fulltext':
        return (
          <input type="text" onChange={e => setState({ ...stateRef.current, value: e.target.value })} />
        );

      case 'numeric':
        return (
          <input type="text" onChange={e => setState({ ...stateRef.current, value: e.target.value })} />
        );

      case 'date':
      case 'datetime':
        return (
          <input type="datetime-local" step="1" defaultValue="" onChange={e => setState({ ...stateRef.current, value: e.target.value })} />
        );

      case 'enum':
      case 'user':
      case 'organization':
      case 'site':
        return (
          <Autocomplete id="dataEntryUser" resourceType="Practitioner" />
        );

      case 'bool':
        return (
          <input type="text" onChange={e => setState({ ...stateRef.current, value: e.target.value })} />
        );
    }
  }

  function onAddClick() {
    const key = state.field;
    if (!key) {
      return;
    }

    const op = state.op;
    if (!op) {
      return;
    }

    props.onAdd({
      key: key,
      op: op,
      value: state.value
    });

    setState({
      ...stateRef.current,
      field: '',
      op: '',
      value: undefined
    });
  }

  if (!state.editing) {
    const resourceType = props.resourceType;
    const filter = props.definition;
    return (
      <tr>
        <td>{buildFieldNameString(props.schema, resourceType, filter.key)}</td>
        <td>{getOpString(filter.op)}</td>
        <td>{filter.value}</td>
        <td>
          <button
            className="btn btn-small"
            onClick={() => setState({
              editing: true,
              field: props.definition.key,
              op: props.definition.op,
              value: props.definition.value
            })}
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
          onClick={() => setState({ ...stateRef.current, editing: false })}
        >Cancel</button>
      </td>
    </tr>
  );
}

export interface SearchFilterEditorProps {
  schema: IndexedStructureDefinition;
  visible: boolean;
  definition: SearchDefinition;
  onOk: (definition: SearchDefinition) => void;
  onCancel: () => void;
}

export function SearchFilterEditor(props: SearchFilterEditorProps) {
  const [state, setState] = useState({
    definition: JSON.parse(JSON.stringify(props.definition)) as SearchDefinition
  });

  function onAddFilter(filter: SearchFilterDefinition) {
    setState({ definition: addFilter(state.definition, filter.key, filter.op, filter.value) });
  }

  function onDeleteFilter(filter: SearchFilterDefinition) {
    if (!state.definition.filters) {
      return;
    }
    const index = state.definition.filters.findIndex(f => Object.is(f, filter));
    setState({ definition: deleteFilter(state.definition, index) });
  }

  if (!props.visible) {
    return null;
  }

  const filters = state.definition.filters || [];

  return (
    <Dialog
      visible={props.visible}
      onOk={() => props.onOk(state.definition)}
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
            {filters.map((filter: SearchFilterDefinition) => (
              <FilterRow
                schema={props.schema}
                resourceType={props.definition.resourceType}
                key={JSON.stringify(filter)}
                definition={filter}
                onAdd={f => onAddFilter(f)}
                onDelete={f => onDeleteFilter(f)}
              />
            ))}
            <FilterRow
              schema={props.schema}
              resourceType={props.definition.resourceType}
              definition={{ key: '', op: '' }}
              onAdd={f => onAddFilter(f)}
              onDelete={f => onDeleteFilter(f)}
            />
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

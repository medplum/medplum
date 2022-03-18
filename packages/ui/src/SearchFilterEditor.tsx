import { Filter, IndexedStructureDefinition, Operator, SearchRequest, stringify } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { SearchFilterValueDisplay } from './SearchFilterValueDisplay';
import { SearchFilterValueInput } from './SearchFilterValueInput';
import {
  addFilter,
  buildFieldNameString,
  deleteFilter,
  getOpString,
  getSearchOperators,
  setFilters,
} from './SearchUtils';
import { Select } from './Select';

export interface SearchFilterEditorProps {
  schema: IndexedStructureDefinition;
  visible: boolean;
  search: SearchRequest;
  onOk: (search: SearchRequest) => void;
  onCancel: () => void;
}

export function SearchFilterEditor(props: SearchFilterEditorProps): JSX.Element | null {
  const [search, setSearch] = useState<SearchRequest>(JSON.parse(stringify(props.search)) as SearchRequest);
  const [editingIndex, setEditingIndex] = useState<number>(-1);

  const searchRef = useRef<SearchRequest>(search);
  searchRef.current = search;

  useEffect(() => {
    setSearch(JSON.parse(stringify(props.search)) as SearchRequest);
  }, [props.search]);

  function onAddFilter(filter: Filter): void {
    setSearch(addFilter(searchRef.current, filter.code, filter.operator, filter.value));
  }

  if (!props.visible) {
    return null;
  }

  const schema = props.schema;
  const resourceType = props.search.resourceType;
  const searchParams = schema.types[resourceType].searchParams as Record<string, SearchParameter>;
  const filters = search.filters || [];

  return (
    <Dialog
      title="Filters"
      visible={props.visible}
      onOk={() => props.onOk(searchRef.current)}
      onCancel={props.onCancel}
    >
      <div className="medplum-filter-editor">
        <table className="medplum-filter-editor-table">
          <thead>
            <tr>
              <th style={{ width: '30%' }}>Field</th>
              <th style={{ width: '30%' }}>Operation</th>
              <th style={{ width: '30%' }}>Value</th>
              <th style={{ width: '10%' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filters.map((filter: Filter, index: number) => {
              if (index === editingIndex) {
                return (
                  <FilterRowInput
                    key={`filter-${index}-${filters.length}-input`}
                    searchParams={searchParams}
                    defaultValue={filter}
                    okText="Save"
                    onOk={(newFilter: Filter) => {
                      const newFilters = [...filters];
                      newFilters[index] = newFilter;
                      setSearch(setFilters(searchRef.current, newFilters));
                      setEditingIndex(-1);
                    }}
                    onCancel={() => setEditingIndex(-1)}
                  />
                );
              } else {
                return (
                  <FilterRowDisplay
                    key={`filter-${index}-${filters.length}-display`}
                    resourceType={resourceType}
                    searchParams={searchParams}
                    filter={filter}
                    onEdit={() => setEditingIndex(index)}
                    onDelete={() => setSearch(deleteFilter(searchRef.current, index))}
                  />
                );
              }
            })}
            <FilterRowInput searchParams={searchParams} okText="Add" onOk={onAddFilter} />
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

interface FilterRowDisplayProps {
  readonly searchParams: Record<string, SearchParameter>;
  readonly resourceType: string;
  readonly filter: Filter;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

function FilterRowDisplay(props: FilterRowDisplayProps): JSX.Element | null {
  const { filter } = props;
  return (
    <tr>
      <td>{buildFieldNameString(filter.code)}</td>
      <td>{getOpString(filter.operator)}</td>
      <td>
        <SearchFilterValueDisplay resourceType={props.resourceType} filter={filter} />
      </td>
      <td>
        <Button size="small" onClick={props.onEdit}>
          Edit
        </Button>
        <Button size="small" onClick={props.onDelete}>
          Delete
        </Button>
      </td>
    </tr>
  );
}

interface FilterRowInputProps {
  searchParams: Record<string, SearchParameter>;
  defaultValue?: Filter;
  okText: string;
  onOk: (value: Filter) => void;
  onCancel?: () => void;
}

function FilterRowInput(props: FilterRowInputProps): JSX.Element {
  const [value, setValue] = useState<Filter>(props.defaultValue ?? ({} as Filter));
  const valueRef = useRef<Filter>(value);
  valueRef.current = value;

  function setFilterCode(newCode: string): void {
    setValue({ ...valueRef.current, code: newCode });
  }

  function setFilterOperator(newOperator: Operator): void {
    setValue({ ...valueRef.current, operator: newOperator });
  }

  function setFilterValue(newFilterValue: string): void {
    setValue({ ...valueRef.current, value: newFilterValue });
  }

  const searchParam = props.searchParams[value.code];
  const operators = searchParam && getSearchOperators(searchParam);

  return (
    <tr>
      <td>
        <Select testid="filter-field" defaultValue={valueRef.current.code} onChange={setFilterCode}>
          <option value=""></option>
          {Object.keys(props.searchParams).map((param) => (
            <option key={param} value={param}>
              {buildFieldNameString(param)}
            </option>
          ))}
        </Select>
      </td>
      <td>
        {operators && (
          <Select
            testid="filter-operation"
            defaultValue={value.operator}
            onChange={setFilterOperator as (newOperator: string) => void}
          >
            <option value=""></option>
            {operators.map((operator) => (
              <option key={operator} value={operator}>
                {getOpString(operator)}
              </option>
            ))}
          </Select>
        )}
      </td>
      <td>
        {searchParam && value.operator && (
          <SearchFilterValueInput searchParam={searchParam} defaultValue={value.value} onChange={setFilterValue} />
        )}
      </td>
      <td>
        {value.code && value.operator && value.value && (
          <Button
            size="small"
            onClick={() => {
              props.onOk(valueRef.current);
              setValue({} as Filter);
            }}
          >
            {props.okText}
          </Button>
        )}
        {props.onCancel && (
          <Button size="small" onClick={props.onCancel}>
            Cancel
          </Button>
        )}
      </td>
    </tr>
  );
}

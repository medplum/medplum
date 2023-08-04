import { Button, Group, Modal, NativeSelect } from '@mantine/core';
import { Filter, globalSchema, Operator, SearchRequest, stringify } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';
import React, { useEffect, useRef, useState } from 'react';
import {
  addFilter,
  buildFieldNameString,
  deleteFilter,
  getOpString,
  getSearchOperators,
  setFilters,
} from '../SearchControl/SearchUtils';
import { SearchFilterValueDisplay } from '../SearchFilterValueDisplay/SearchFilterValueDisplay';
import { SearchFilterValueInput } from '../SearchFilterValueInput/SearchFilterValueInput';

export interface SearchFilterEditorProps {
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

  const resourceType = props.search.resourceType;
  const searchParams = (globalSchema.types[resourceType].searchParams as Record<string, SearchParameter>) ?? {};
  const filters = search.filters || [];

  return (
    <Modal
      title="Filters"
      closeButtonProps={{ 'aria-label': 'Close' }}
      size={900}
      opened={props.visible}
      onClose={props.onCancel}
    >
      <div>
        <table>
          <colgroup>
            <col style={{ width: 200 }} />
            <col style={{ width: 200 }} />
            <col style={{ width: 380 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Field</th>
              <th>Operation</th>
              <th>Value</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filters.map((filter: Filter, index: number) => {
              if (index === editingIndex) {
                return (
                  <FilterRowInput
                    key={`filter-${filter.code}-${filter.operator}-${filter.value}-input`}
                    resourceType={resourceType}
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
                    key={`filter-${filter.code}-${filter.operator}-${filter.value}-display`}
                    resourceType={resourceType}
                    searchParams={searchParams}
                    filter={filter}
                    onEdit={() => setEditingIndex(index)}
                    onDelete={() => setSearch(deleteFilter(searchRef.current, index))}
                  />
                );
              }
            })}
            <FilterRowInput resourceType={resourceType} searchParams={searchParams} okText="Add" onOk={onAddFilter} />
          </tbody>
        </table>
      </div>
      <Group position="right" mt="xl">
        <Button onClick={() => props.onOk(searchRef.current)}>OK</Button>
      </Group>
    </Modal>
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
        <Button compact variant="outline" onClick={props.onEdit}>
          Edit
        </Button>
        <Button compact variant="outline" onClick={props.onDelete}>
          Delete
        </Button>
      </td>
    </tr>
  );
}

interface FilterRowInputProps {
  resourceType: string;
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
        <NativeSelect
          data-testid="filter-field"
          defaultValue={valueRef.current.code}
          onChange={(e) => setFilterCode(e.currentTarget.value)}
          data={['', ...Object.keys(props.searchParams).map((param) => ({ value: param, label: buildFieldNameString(param) }))]}
        />
      </td>
      <td>
        {operators && (
          <NativeSelect
            data-testid="filter-operation"
            defaultValue={value.operator}
            onChange={(e) => setFilterOperator(e.currentTarget.value as Operator)}
            data={['', ...operators.map((op) => ({ value: op, label: getOpString(op) }))]}
          />
        )}
      </td>
      <td>
        {searchParam && value.operator && (
          <SearchFilterValueInput
            resourceType={props.resourceType}
            searchParam={searchParam}
            defaultValue={value.value}
            onChange={setFilterValue}
          />
        )}
      </td>
      <td>
        {value.code && value.operator && value.value && (
          <Button
            compact
            variant="outline"
            onClick={() => {
              props.onOk(valueRef.current);
              setValue({} as Filter);
            }}
          >
            {props.okText}
          </Button>
        )}
        {props.onCancel && (
          <Button compact variant="outline" onClick={props.onCancel}>
            Cancel
          </Button>
        )}
      </td>
    </tr>
  );
}

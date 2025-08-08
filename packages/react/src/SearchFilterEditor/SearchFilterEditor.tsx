// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Group, Modal, NativeSelect } from '@mantine/core';
import { Filter, Operator, SearchRequest, deepClone, getSearchParameters } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';
import { IconX } from '@tabler/icons-react';
import { JSX, useEffect, useRef, useState } from 'react';
import { ArrayAddButton } from '../buttons/ArrayAddButton';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import {
  addFilter,
  buildFieldNameString,
  deleteFilter,
  getOpString,
  getSearchOperators,
  setFilters,
} from '../SearchControl/SearchUtils';
import { SearchFilterValueInput } from '../SearchFilterValueInput/SearchFilterValueInput';

export interface SearchFilterEditorProps {
  readonly visible: boolean;
  readonly search: SearchRequest;
  readonly onOk: (search: SearchRequest) => void;
  readonly onCancel: () => void;
}

export function SearchFilterEditor(props: SearchFilterEditorProps): JSX.Element | null {
  const [search, setSearch] = useState<SearchRequest>(deepClone(props.search) as SearchRequest);

  const searchRef = useRef<SearchRequest>(search);
  searchRef.current = search;

  useEffect(() => {
    setSearch(deepClone(props.search) as SearchRequest);
  }, [props.search]);

  function onAddFilter(filter: Filter): void {
    setSearch(addFilter(searchRef.current, filter.code, filter.operator, filter.value));
  }

  const resourceType = props.search.resourceType;
  const searchParams = getSearchParameters(resourceType) ?? {};
  const filters = search.filters || [];

  return (
    <Modal
      title="Filters"
      closeButtonProps={{ 'aria-label': 'Close' }}
      size={900}
      opened={props.visible}
      onClose={props.onCancel}
    >
      <Form onSubmit={() => props.onOk(searchRef.current)}>
        <div>
          <table>
            <colgroup>
              <col style={{ width: 200 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 380 }} />
              <col style={{ width: 40 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Field</th>
                <th>Operation</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filters.map((filter: Filter, index: number) => (
                <FilterRowInput
                  id={`filter-${index}-row`}
                  key={`filter-${index}-row`}
                  resourceType={resourceType}
                  searchParams={searchParams}
                  value={filter}
                  onChange={(newFilter: Filter) => {
                    const newFilters = [...filters];
                    newFilters[index] = newFilter;
                    setSearch(setFilters(searchRef.current, newFilters));
                  }}
                  onDelete={() => setSearch(deleteFilter(searchRef.current, index))}
                />
              ))}
            </tbody>
          </table>
          <ArrayAddButton propertyDisplayName="Filter" onClick={() => onAddFilter({} as Filter)} />
        </div>
        <Group justify="flex-end" mt="xl">
          <SubmitButton>OK</SubmitButton>
        </Group>
      </Form>
    </Modal>
  );
}

interface FilterRowInputProps {
  readonly id: string;
  readonly resourceType: string;
  readonly searchParams: Record<string, SearchParameter>;
  readonly value: Filter;
  readonly onChange: (value: Filter) => void;
  readonly onDelete?: () => void;
}

function FilterRowInput(props: FilterRowInputProps): JSX.Element {
  const value: Filter = props.value;
  const valueRef = useRef<Filter>(value);
  valueRef.current = value;

  function setFilterCode(newCode: string): void {
    valueRef.current.code = newCode;
    valueRef.current.operator = Operator.EQUALS;
    valueRef.current.value = '';
    props.onChange(valueRef.current);
  }

  function setFilterOperator(newOperator: Operator): void {
    valueRef.current.operator = newOperator;
    valueRef.current.value = '';
    props.onChange(valueRef.current);
  }

  function setFilterValue(newFilterValue: string): void {
    valueRef.current.value = newFilterValue;
    props.onChange(valueRef.current);
  }

  const searchParam = props.searchParams[value.code];
  const operators = searchParam && getSearchOperators(searchParam);

  return (
    <tr>
      <td>
        <NativeSelect
          data-testid={`${props.id}-filter-field`}
          defaultValue={props.value.code}
          onChange={(e) => setFilterCode(e.currentTarget.value)}
          data={[
            '',
            ...Object.keys(props.searchParams).map((param) => ({ value: param, label: buildFieldNameString(param) })),
          ]}
        />
      </td>
      <td>
        {operators && (
          <NativeSelect
            key={`${props.id}-filter-value-${props.value.code}`}
            data-testid={`${props.id}-filter-operation`}
            defaultValue={value.operator}
            onChange={(e) => setFilterOperator(e.currentTarget.value as Operator)}
            data={['', ...operators.map((op) => ({ value: op, label: getOpString(op) }))]}
          />
        )}
      </td>
      <td>
        {searchParam && value.operator && (
          <SearchFilterValueInput
            key={`${props.id}-filter-value-${props.value.code}-${props.value.operator}`}
            name={`${props.id}-filter-value`}
            resourceType={props.resourceType}
            searchParam={searchParam}
            defaultValue={value.value}
            onChange={setFilterValue}
          />
        )}
      </td>
      <td>
        {props.onDelete && (
          <ActionIcon variant="outline" color="red" radius="xl" aria-label="Delete filter" onClick={props.onDelete}>
            <IconX style={{ width: '70%', height: '70%' }} stroke={1.5} />
          </ActionIcon>
        )}
      </td>
    </tr>
  );
}

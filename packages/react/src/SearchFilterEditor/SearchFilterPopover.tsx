// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ComboboxData } from '@mantine/core';
import { ActionIcon, Select, Text } from '@mantine/core';
import type { Filter, SearchRequest } from '@medplum/core';
import { Operator, deepEquals, getSearchParameters } from '@medplum/core';
import type { SearchParameter } from '@medplum/fhirtypes';
import { IconFilter2Plus, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AddRowButton, SearchToolbarPopover } from '../SearchControl/SearchToolbarPopover';
import shell from '../SearchControl/SearchToolbarPopover.module.css';
import { getOpString, getSearchOperators, getSearchParamSelectData, setFilters } from '../SearchControl/SearchUtils';
import type { EditableRow } from '../SearchControl/useEditableRows';
import { useEditableRows } from '../SearchControl/useEditableRows';
import { SearchFilterValueInput } from '../SearchFilterValueInput/SearchFilterValueInput';
import classes from './SearchFilterPopover.module.css';

export interface SearchFilterPopoverProps {
  readonly search: SearchRequest;
  readonly onChange: (search: SearchRequest) => void;
  /** External request to open the popover with a new condition for a field; change the `nonce` to trigger it again. */
  readonly requestFilterField?: { readonly code: string; readonly nonce: number };
}

/**
 * Popover-based filter builder for the {@link SearchControl} toolbar: a list of `Where`/`and` +
 * field + operator + value conditions that apply live once complete. `SearchRequest.filters` is a
 * flat AND-combined array, so the conjunction is a static label.
 * @param props - The filter popover props.
 * @returns The filter popover React node.
 */
export function SearchFilterPopover(props: SearchFilterPopoverProps): JSX.Element {
  const { search, onChange } = props;
  const [opened, setOpened] = useState(false);
  const { rows, reset, update, remove, add } = useEditableRows<Partial<Filter>>(() => [...(search.filters ?? [])]);
  const searchParams = useMemo(() => getSearchParameters(search.resourceType) ?? {}, [search.resourceType]);
  const fieldData = useMemo(() => getSearchParamSelectData(searchParams), [searchParams]);

  const lastNonce = useRef<number | undefined>(undefined);
  useEffect(() => {
    const req = props.requestFilterField;
    if (req && req.nonce !== lastNonce.current) {
      lastNonce.current = req.nonce;
      reset([...(search.filters ?? []), { code: req.code, operator: Operator.EQUALS, value: '' }]);
      setOpened(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.requestFilterField]);

  function toggle(): void {
    if (!opened) {
      reset([...(search.filters ?? [])]);
    }
    setOpened((o) => !o);
  }

  function emit(nextRows: EditableRow<Partial<Filter>>[]): void {
    const complete = nextRows.map((row) => row.value).filter(isCompleteFilter);
    if (!deepEquals(complete, search.filters ?? [])) {
      onChange(setFilters(search, complete));
    }
  }

  const activeCount = (search.filters ?? []).length;
  const activeLabel =
    activeCount > 0 ? `${activeCount} ${activeCount === 1 ? 'Filter' : 'Filters'} Applied` : undefined;

  return (
    <SearchToolbarPopover
      label="Filters"
      icon={<IconFilter2Plus size={16} />}
      width={720}
      opened={opened}
      onToggle={toggle}
      onChange={setOpened}
      activeLabel={activeLabel}
      footer={<AddRowButton label="Add Filter" onClick={() => add({})} />}
    >
      <div className={shell.body} tabIndex={-1} data-autofocus>
        {rows.length === 0 && <div className={shell.empty}>No filters applied</div>}
        {rows.map((row, index) => (
          <FilterConditionRow
            key={row.id}
            rowId={row.id}
            index={index}
            resourceType={search.resourceType}
            searchParams={searchParams}
            fieldData={fieldData}
            value={row.value}
            onChange={(next) => emit(update(index, next))}
            onDelete={() => emit(remove(index))}
          />
        ))}
      </div>
    </SearchToolbarPopover>
  );
}

interface FilterConditionRowProps {
  readonly rowId: number;
  readonly index: number;
  readonly resourceType: string;
  readonly searchParams: Record<string, SearchParameter>;
  readonly fieldData: ComboboxData;
  readonly value: Partial<Filter>;
  readonly onChange: (value: Partial<Filter>) => void;
  readonly onDelete: () => void;
}

function FilterConditionRow(props: FilterConditionRowProps): JSX.Element {
  const { value, searchParams, index } = props;
  const searchParam = value.code ? searchParams[value.code] : undefined;
  const operators = searchParam && getSearchOperators(searchParam);
  const wideValue = !!value.operator && searchParam?.type === 'reference' && searchParam.target?.length !== 1;

  return (
    <div className={`${shell.row} ${classes.row}`}>
      <Text className={classes.conjunction}>{index === 0 ? 'Where' : 'and'}</Text>
      <Select
        comboboxProps={{ withinPortal: false }}
        className={classes.field}
        aria-label={`Filter ${index + 1} field`}
        placeholder="Field"
        searchable
        data={props.fieldData}
        value={value.code ?? null}
        onChange={(code) => props.onChange({ code: code ?? undefined, operator: Operator.EQUALS, value: '' })}
      />
      <Select
        comboboxProps={{ withinPortal: false }}
        className={classes.operator}
        aria-label={`Filter ${index + 1} operator`}
        placeholder="Operator"
        disabled={!operators}
        data={operators ? operators.map((op) => ({ value: op, label: getOpString(op) })) : []}
        value={value.operator ?? null}
        onChange={(op) => props.onChange({ code: value.code, operator: (op as Operator) ?? undefined, value: '' })}
      />
      <div className={wideValue ? classes.valueWide : classes.value}>
        {searchParam && value.operator && (
          <SearchFilterValueInput
            key={`filter-${props.rowId}-value-${value.code}-${value.operator}`}
            name={`filter-${index}-value`}
            ariaLabel={`Filter ${index + 1} value`}
            resourceType={props.resourceType}
            searchParam={searchParam}
            defaultValue={value.value}
            withinPortal={false}
            onChange={(newValue) => props.onChange({ code: value.code, operator: value.operator, value: newValue })}
          />
        )}
      </div>
      <ActionIcon
        variant="subtle"
        color="gray"
        radius="xl"
        aria-label={`Remove filter ${index + 1}`}
        ml={2}
        onClick={props.onDelete}
      >
        <IconX size={16} stroke={2} className={shell.deleteIcon} />
      </ActionIcon>
    </div>
  );
}

function isCompleteFilter(filter: Partial<Filter>): filter is Filter {
  return !!filter.code && !!filter.operator && filter.value !== undefined && filter.value !== '';
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ComboboxData } from '@mantine/core';
import { ActionIcon, Select, Text } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import type { Filter, SearchRequest } from '@medplum/core';
import {
  Operator,
  SearchParameterType,
  deepEquals,
  getSearchParameterDetails,
  getSearchParameters,
} from '@medplum/core';
import type { SearchParameter } from '@medplum/fhirtypes';
import { IconFilter2Plus, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { AddRowButton, SearchToolbarPopover } from '../SearchControl/SearchToolbarPopover';
import popoverClasses from '../SearchControl/SearchToolbarPopover.module.css';
import { getOpString, getSearchOperators, getSearchParamSelectData, setFilters } from '../SearchControl/SearchUtils';
import type { EditableRow } from '../SearchControl/useEditableRows';
import { useEditableRows } from '../SearchControl/useEditableRows';
import { SearchFilterValueInput } from '../SearchFilterValueInput/SearchFilterValueInput';
import classes from './SearchFilterPopover.module.css';

export interface SearchFilterPopoverProps {
  readonly search: SearchRequest;
  readonly onChange: (search: SearchRequest) => void;
}

/** How long typing in a value input can pause before the filter is applied to the search. */
const FILTER_VALUE_DEBOUNCE_MS = 300;

/**
 * Popover-based filter builder for the {@link SearchControl} toolbar: a list of
 * `Where`/`and` + field + operator + value conditions that apply live as the user edits.
 * `SearchRequest.filters` is a flat AND-combined array, so the leading conjunction is a static
 * label rather than an editable and/or toggle. Incomplete rows stay local until they have a value.
 * Field, operator and remove changes apply at once; typed values apply after a short pause, or
 * when the popover closes. Changing the field or operator of an applied condition keeps its value
 * when the new field takes the same kind of input, so the condition is updated rather than dropped.
 * @param props - The filter popover props.
 * @returns The filter popover React node.
 */
export function SearchFilterPopover(props: SearchFilterPopoverProps): JSX.Element {
  const { search, onChange } = props;
  const [opened, setOpened] = useState(false);
  const { rows, reset, update, remove, add } = useEditableRows<Partial<Filter>>(() => getInitialFilters(search));
  const searchParams = useMemo(() => getSearchParameters(search.resourceType) ?? {}, [search.resourceType]);
  const fieldData = useMemo(() => getSearchParamSelectData(searchParams), [searchParams]);

  function emit(nextRows: EditableRow<Partial<Filter>>[]): void {
    const complete = nextRows.map((row) => row.value).filter(isCompleteFilter);
    if (!deepEquals(complete, search.filters ?? [])) {
      onChange(setFilters(search, complete));
    }
  }

  const emitDebounced = useDebouncedCallback(emit, { delay: FILTER_VALUE_DEBOUNCE_MS, flushOnUnmount: true });

  function emitNow(nextRows: EditableRow<Partial<Filter>>[]): void {
    emitDebounced.cancel();
    emit(nextRows);
  }

  function setOpenedFlushing(nextOpened: boolean): void {
    if (!nextOpened) {
      emitDebounced.flush();
    }
    setOpened(nextOpened);
  }

  function toggle(): void {
    if (!opened) {
      reset(getInitialFilters(search));
    }
    setOpenedFlushing(!opened);
  }

  const activeCount = search.filters?.length ?? 0;
  const activeLabel =
    activeCount > 0 ? `${activeCount} ${activeCount === 1 ? 'Filter' : 'Filters'} Applied` : undefined;

  return (
    <SearchToolbarPopover
      label="Filters"
      icon={<IconFilter2Plus size={16} />}
      width={860}
      opened={opened}
      onToggle={toggle}
      onChange={setOpenedFlushing}
      activeLabel={activeLabel}
      footer={<AddRowButton label="Add Filter" onClick={() => add({})} />}
    >
      <div className={popoverClasses.body} tabIndex={-1} data-autofocus>
        {rows.length === 0 && <div className={popoverClasses.empty}>No filters applied</div>}
        {rows.map(({ id, value }, index) => (
          <FilterConditionRow
            key={id}
            rowId={id}
            index={index}
            resourceType={search.resourceType}
            searchParams={searchParams}
            fieldData={fieldData}
            value={value}
            onChange={(next) => emitNow(update(index, next))}
            onValueChange={(next) => emitDebounced(update(index, next))}
            onDelete={() => emitNow(remove(index))}
          />
        ))}
      </div>
    </SearchToolbarPopover>
  );
}

/**
 * Props for one condition row in the filter popover.
 * - `rowId`: stable key for the row, so its value input is not remounted when earlier rows are removed.
 * - `index`: position in the list; drives the `Where`/`and` label and the accessible names.
 * - `resourceType`: the searched resource type, used to render the value input.
 * - `searchParams`: the resource type's search parameters, keyed by code.
 * - `fieldData`: grouped Select options for the field picker.
 * - `value`: the condition being edited; incomplete until it has a code, operator and value.
 * - `onChange`: the field or operator changed; applied immediately.
 * - `onValueChange`: the value input changed; may fire on every keystroke, so it is debounced.
 * - `onDelete`: remove this row.
 */
interface FilterConditionRowProps {
  readonly rowId: number;
  readonly index: number;
  readonly resourceType: string;
  readonly searchParams: Record<string, SearchParameter>;
  readonly fieldData: ComboboxData;
  readonly value: Partial<Filter>;
  readonly onChange: (value: Partial<Filter>) => void;
  readonly onValueChange: (value: Partial<Filter>) => void;
  readonly onDelete: () => void;
}

/**
 * One filter condition on a single line: conjunction, field, operator, value and remove button.
 * @param props - The condition row props.
 * @returns The condition row React node.
 */
function FilterConditionRow(props: FilterConditionRowProps): JSX.Element {
  const { value, searchParams, resourceType, index } = props;
  const searchParam = value.code ? searchParams[value.code] : undefined;
  const operators = searchParam && getSearchOperators(searchParam);

  function changeField(code: string | null): void {
    const nextParam = code ? searchParams[code] : undefined;
    const keepOperator = !!value.operator && !!nextParam && !!getSearchOperators(nextParam)?.includes(value.operator);
    const keepValue = !!searchParam && !!nextParam && canKeepValue(resourceType, searchParam, nextParam);
    props.onChange({
      code: code ?? undefined,
      operator: keepOperator ? value.operator : Operator.EQUALS,
      value: keepValue ? value.value : '',
    });
  }

  function changeOperator(op: string | null): void {
    props.onChange({ code: value.code, operator: (op as Operator) ?? undefined, value: value.value });
  }

  const valueInput = (
    <div className={classes.value}>
      {searchParam && value.operator && (
        <SearchFilterValueInput
          key={`filter-${props.rowId}-value-${value.code}-${value.operator}`}
          name={`filter-${index}-value`}
          ariaLabel={`Filter ${index + 1} value`}
          resourceType={props.resourceType}
          searchParam={searchParam}
          defaultValue={value.value}
          withinPortal={false}
          onChange={(newValue) => props.onValueChange({ code: value.code, operator: value.operator, value: newValue })}
        />
      )}
    </div>
  );

  const deleteButton = (
    <ActionIcon
      variant="subtle"
      color="gray"
      radius="xl"
      aria-label={`Remove filter ${index + 1}`}
      ml={2}
      onClick={props.onDelete}
    >
      <IconX size={16} stroke={2} className={popoverClasses.deleteIcon} />
    </ActionIcon>
  );

  return (
    <div className={classes.row}>
      <Text className={classes.conjunction}>{index === 0 ? 'Where' : 'and'}</Text>
      <Select
        comboboxProps={{ withinPortal: false }}
        className={classes.field}
        aria-label={`Filter ${index + 1} field`}
        placeholder="Field"
        searchable
        data={props.fieldData}
        value={value.code ?? null}
        onChange={changeField}
      />
      <Select
        comboboxProps={{ withinPortal: false }}
        className={classes.operator}
        aria-label={`Filter ${index + 1} operator`}
        placeholder="Operator"
        disabled={!operators}
        data={operators ? operators.map((op) => ({ value: op, label: getOpString(op) })) : []}
        value={value.operator ?? null}
        onChange={changeOperator}
      />
      {valueInput}
      {deleteButton}
    </div>
  );
}

/**
 * Whether a condition's value still fits after its field changes: the new field must take the same
 * kind of input. References never carry over, since their value is picked from a search of the
 * field's target types rather than typed.
 * @param resourceType - The searched resource type.
 * @param prevParam - The search parameter the value was entered for.
 * @param nextParam - The newly selected search parameter.
 * @returns True if the value can be carried over to the new field.
 */
function canKeepValue(resourceType: string, prevParam: SearchParameter, nextParam: SearchParameter): boolean {
  const type = getSearchParameterDetails(resourceType, nextParam).type;
  return type !== SearchParameterType.REFERENCE && type === getSearchParameterDetails(resourceType, prevParam).type;
}

function getInitialFilters(search: SearchRequest): Partial<Filter>[] {
  return [...(search.filters ?? [])];
}

function isCompleteFilter(filter: Partial<Filter>): filter is Filter {
  return !!filter.code && !!filter.operator && filter.value !== undefined && filter.value !== '';
}

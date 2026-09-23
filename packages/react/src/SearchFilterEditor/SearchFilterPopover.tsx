// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Button, Indicator, Popover, Select, Text } from '@mantine/core';
import type { Filter, SearchRequest } from '@medplum/core';
import { Operator, deepClone, getSearchParameters } from '@medplum/core';
import type { SearchParameter } from '@medplum/fhirtypes';
import { IconCirclePlus, IconFilter2Plus, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildSearchParamFieldLabel,
  getOpString,
  getSearchOperators,
  isMetaSearchParam,
  setFilters,
} from '../SearchControl/SearchUtils';
import { SearchFilterValueInput } from '../SearchFilterValueInput/SearchFilterValueInput';
import classes from './SearchFilterPopover.module.css';

export interface SearchFilterPopoverProps {
  readonly search: SearchRequest;
  readonly onChange: (search: SearchRequest) => void;
  readonly buttonVariant?: string;
  readonly buttonColor?: string;
  readonly buttonClassName?: string;
  readonly iconSize?: number;
  /**
   * External request to open the popover with a new condition for a specific field preselected
   * (e.g. from a column header's "Filter by this column"). Change the `nonce` to trigger it again.
   */
  readonly requestFilterField?: { readonly code: string; readonly nonce: number };
}

/**
 * Popover-based filter builder for the {@link SearchControl} toolbar. Presents the filters as an
 * Airtable-style list of conditions (`Where`/`and` + field + operator + value) that apply live as
 * the user edits. Medplum's `SearchRequest.filters` is a flat AND-combined array, so the leading
 * conjunction is a static `Where`/`and` label rather than an editable and/or toggle.
 * @param props - The filter popover props.
 * @returns The filter popover React node.
 */
export function SearchFilterPopover(props: SearchFilterPopoverProps): JSX.Element {
  const { search, onChange } = props;
  const buttonVariant = props.buttonVariant ?? 'subtle';
  const buttonColor = props.buttonColor ?? 'gray';
  const iconSize = props.iconSize ?? 16;

  const [opened, setOpened] = useState(false);
  // Local working copy so partially-entered rows (no value yet) can exist without wiping results.
  const [rows, setRows] = useState<Partial<Filter>[]>(() => deepClone(search.filters ?? []));

  const searchParams = useMemo(() => getSearchParameters(search.resourceType) ?? {}, [search.resourceType]);

  // Respond to an external "Filter by this column" request: open the popover and seed a new
  // condition with the requested field preselected. The nonce lets the same field re-trigger it.
  const lastNonce = useRef<number | undefined>(undefined);
  useEffect(() => {
    const req = props.requestFilterField;
    if (req && req.nonce !== lastNonce.current) {
      lastNonce.current = req.nonce;
      setRows([...deepClone(search.filters ?? []), { code: req.code, operator: Operator.EQUALS, value: '' }]);
      setOpened(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.requestFilterField]);

  // Reset the working copy from the current search each time the popover opens, so it reflects
  // filters applied elsewhere without clobbering in-progress edits while open.
  function toggle(): void {
    if (!opened) {
      setRows(deepClone(search.filters ?? []));
    }
    setOpened((o) => !o);
  }

  function emit(nextRows: Partial<Filter>[]): void {
    setRows(nextRows);
    const complete = nextRows.filter(isCompleteFilter);
    onChange(setFilters(search, complete));
  }

  function updateRow(index: number, next: Partial<Filter>): void {
    const nextRows = [...rows];
    nextRows[index] = next;
    emit(nextRows);
  }

  function deleteRow(index: number): void {
    const nextRows = rows.filter((_, i) => i !== index);
    emit(nextRows);
  }

  function addRow(): void {
    setRows([...rows, {}]);
  }

  const activeCount = (search.filters ?? []).length;

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      shadow="md"
      radius="md"
      width={720}
      trapFocus={false}
      closeOnClickOutside
    >
      <Popover.Target>
        <Indicator className={classes.indicator} disabled={activeCount === 0} color="blue" size={8} offset={6}>
          <Button
            className={props.buttonClassName}
            data-opened={opened || undefined}
            size="compact-md"
            variant={buttonVariant}
            color={buttonColor}
            leftSection={<IconFilter2Plus size={iconSize} />}
            onClick={toggle}
          >
            Filters
          </Button>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown className={classes.dropdown}>
        <div className={classes.body}>
          {rows.length === 0 && <div className={classes.empty}>No filters applied</div>}
          {rows.map((filter, index) => (
            <FilterConditionRow
              key={`filter-row-${index}`}
              index={index}
              resourceType={search.resourceType}
              searchParams={searchParams}
              value={filter}
              onChange={(next) => updateRow(index, next)}
              onDelete={() => deleteRow(index)}
            />
          ))}
        </div>
        <div className={classes.footer}>
          <Button
            className={classes.addButton}
            size="compact-sm"
            variant="subtle"
            color="blue"
            leftSection={<IconCirclePlus size={16} />}
            fw={500}
            onClick={addRow}
          >
            Add Filter
          </Button>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

interface FilterConditionRowProps {
  readonly index: number;
  readonly resourceType: string;
  readonly searchParams: Record<string, SearchParameter>;
  readonly value: Partial<Filter>;
  readonly onChange: (value: Partial<Filter>) => void;
  readonly onDelete: () => void;
}

function FilterConditionRow(props: FilterConditionRowProps): JSX.Element {
  const { value, searchParams } = props;

  const fieldData = useMemo(() => {
    const fieldOptions = [];
    const metaOptions = [];
    for (const param of Object.keys(searchParams)) {
      const option = { value: param, label: buildSearchParamFieldLabel(param) };
      if (isMetaSearchParam(param)) {
        metaOptions.push(option);
      } else {
        fieldOptions.push(option);
      }
    }
    return [
      ...(fieldOptions.length > 0 ? [{ group: 'Fields', items: fieldOptions }] : []),
      ...(metaOptions.length > 0 ? [{ group: 'Metadata', items: metaOptions }] : []),
    ];
  }, [searchParams]);

  const searchParam = value.code ? searchParams[value.code] : undefined;
  const operators = searchParam && getSearchOperators(searchParam);

  // A reference value with anything other than a single fixed target renders two controls (a resource
  // type picker plus the value), making the row too wide for the popover. Wrap the value onto a second
  // line (aligned under the field) so nothing gets cut off.
  const multiInput = !!value.operator && searchParam?.type === 'reference' && searchParam.target?.length !== 1;

  const deleteButton = (
    <ActionIcon
      variant="subtle"
      color="gray"
      radius="xl"
      aria-label={`delete-filter-${props.index}`}
      ml={2}
      onClick={props.onDelete}
    >
      <IconX size={16} stroke={2} color="var(--mantine-color-gray-7)" />
    </ActionIcon>
  );

  // A hidden twin of the delete button reserves the same space on the second line, so the value
  // input's right edge lines up with the operator's above it.
  const deleteSpacer = (
    <ActionIcon
      variant="subtle"
      radius="xl"
      ml={2}
      aria-hidden
      tabIndex={-1}
      style={{ visibility: 'hidden', pointerEvents: 'none' }}
    >
      <IconX size={16} stroke={2} />
    </ActionIcon>
  );

  const valueInput = (
    <div className={classes.value}>
      {searchParam && value.operator && (
        <SearchFilterValueInput
          key={`filter-${props.index}-value-${value.code}-${value.operator}`}
          name={`filter-${props.index}-value`}
          resourceType={props.resourceType}
          searchParam={searchParam}
          defaultValue={value.value}
          onChange={(newValue) => props.onChange({ code: value.code, operator: value.operator, value: newValue })}
        />
      )}
    </div>
  );

  return (
    <div className={multiInput ? `${classes.row} ${classes.rowMulti}` : classes.row}>
      <Text className={classes.conjunction}>{props.index === 0 ? 'Where' : 'and'}</Text>
      <Select
        comboboxProps={{ withinPortal: false }}
        className={classes.field}
        aria-label={`filter-${props.index}-field`}
        placeholder="Field"
        searchable
        data={fieldData}
        value={value.code ?? null}
        onChange={(code) => props.onChange({ code: code ?? undefined, operator: Operator.EQUALS, value: '' })}
      />
      <Select
        comboboxProps={{ withinPortal: false }}
        className={classes.operator}
        aria-label={`filter-${props.index}-operator`}
        placeholder="Operator"
        disabled={!operators}
        data={operators ? operators.map((op) => ({ value: op, label: getOpString(op) })) : []}
        value={value.operator ?? null}
        onChange={(op) => props.onChange({ code: value.code, operator: (op as Operator) ?? undefined, value: '' })}
      />
      {multiInput ? (
        <>
          {deleteButton}
          <div className={classes.secondLine}>
            {valueInput}
            {deleteSpacer}
          </div>
        </>
      ) : (
        <>
          {valueInput}
          {deleteButton}
        </>
      )}
    </div>
  );
}

function isCompleteFilter(filter: Partial<Filter>): filter is Filter {
  return !!filter.code && !!filter.operator && filter.value !== undefined && filter.value !== '';
}

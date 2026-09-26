// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Button, Indicator, Popover, Select, Tooltip, VisuallyHidden } from '@mantine/core';
import type { SearchRequest, SortRule } from '@medplum/core';
import { deepClone, getSearchParameters } from '@medplum/core';
import type { SearchParameter } from '@medplum/fhirtypes';
import { IconArrowsSort, IconCirclePlus, IconRotate2, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useId, useMemo, useState } from 'react';
import {
  buildSearchParamFieldLabel,
  DEFAULT_SORT_RULES,
  isMetaSearchParam,
  isSameSort,
} from '../SearchControl/SearchUtils';
import classes from './SearchSortEditor.module.css';

export interface SearchSortEditorProps {
  readonly search: SearchRequest;
  readonly onChange: (search: SearchRequest) => void;
  readonly buttonVariant?: string;
  readonly buttonColor?: string;
  readonly buttonClassName?: string;
  readonly iconSize?: number;
  /** The sort applied when there are no sort rules; hides the indicator while it's active. */
  readonly defaultSortRules?: readonly SortRule[];
}

/**
 * Returns true when the sort is the table default (no rules, or exactly the default rules), so the
 * Sort button shows no active-sort indicator.
 * @param rules - The current sort rules.
 * @param defaultRules - The default sort rules.
 * @returns True if the sort matches the default order.
 */
function isDefaultSort(rules: readonly SortRule[], defaultRules: readonly SortRule[]): boolean {
  return rules.length === 0 || isSameSort(rules, defaultRules);
}

/**
 * Direction labels vary by the search parameter type so they read naturally, mirroring the
 * per-column sort menu (e.g. dates sort oldest/newest, numbers smallest/largest, text A→Z).
 * @param searchParam - The search parameter being sorted, or undefined when none is chosen yet.
 * @returns The ascending and descending direction labels for the parameter type.
 */
function getDirectionLabels(searchParam: SearchParameter | undefined): { asc: string; desc: string } {
  switch (searchParam?.type) {
    case 'date':
      return { asc: 'Oldest → Newest', desc: 'Newest → Oldest' };
    case 'number':
    case 'quantity':
      return { asc: 'Smallest → Largest', desc: 'Largest → Smallest' };
    default:
      return { asc: 'A → Z', desc: 'Z → A' };
  }
}

/**
 * Returns the rows the popover starts with: the search's sort rules, or the default sort when it has none.
 * @param search - The search request.
 * @param defaultRules - The default sort rules.
 * @returns The initial sort rules.
 */
function getInitialRules(search: SearchRequest, defaultRules: readonly SortRule[]): SortRule[] {
  return deepClone(search.sortRules?.length ? search.sortRules : [...defaultRules]);
}

/**
 * Popover-based sort builder for the {@link SearchControl} toolbar. Presents the sort rules as an
 * ordered list of `field + direction` rows that apply live as the user edits. When there is a default
 * sort, the list is never empty: the last row's remove button is disabled while it matches the
 * default, and becomes a reset-to-default button once it differs.
 * @param props - The sort editor props.
 * @returns The sort editor React node.
 */
export function SearchSortEditor(props: SearchSortEditorProps): JSX.Element {
  const { search, onChange } = props;
  const buttonVariant = props.buttonVariant ?? 'subtle';
  const buttonColor = props.buttonColor ?? 'gray';
  const iconSize = props.iconSize ?? 16;
  const defaultSortRules = props.defaultSortRules ?? DEFAULT_SORT_RULES;

  const [opened, setOpened] = useState(false);
  const [rows, setRows] = useState<SortRow[]>(() => toRows(getInitialRules(search, defaultSortRules)));

  const searchParams = useMemo(() => getSearchParameters(search.resourceType) ?? {}, [search.resourceType]);

  function toggle(): void {
    if (!opened) {
      setRows(toRows(getInitialRules(search, defaultSortRules)));
    }
    setOpened((o) => !o);
  }

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

  function emit(nextRows: SortRow[]): void {
    setRows(nextRows);
    const complete = nextRows.map((row) => row.rule).filter((r) => !!r.code);
    onChange({ ...search, sortRules: complete });
  }

  function updateRule(index: number, next: SortRule): void {
    const nextRows = [...rows];
    nextRows[index] = { ...nextRows[index], rule: next };
    emit(nextRows);
  }

  function deleteRule(index: number): void {
    emit(rows.filter((_, i) => i !== index));
  }

  function resetToDefault(): void {
    emit(toRows(deepClone([...defaultSortRules])));
  }

  function addRule(): void {
    setRows([...rows, ...toRows([{ code: '', descending: false }])]);
  }

  const activeCount = (search.sortRules ?? []).length;
  const showIndicator = !isDefaultSort(search.sortRules ?? [], defaultSortRules);
  const isLastRow = rows.length === 1 && defaultSortRules.length > 0;
  const rowsAtDefault = isSameSort(
    rows.map((row) => row.rule),
    defaultSortRules
  );
  const activeLabel = `${activeCount} ${activeCount === 1 ? 'Sort' : 'Sorts'} Applied`;
  const activeLabelId = useId();

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      shadow="md"
      radius="md"
      width={520}
      trapFocus
      returnFocus
      closeOnClickOutside
    >
      <Indicator className={classes.indicator} disabled={!showIndicator} color="blue" size={8} offset={6}>
        <Tooltip label={activeLabel} position="bottom" openDelay={500} disabled={!showIndicator || opened}>
          <Popover.Target>
            <Button
              className={props.buttonClassName}
              data-opened={opened || undefined}
              size="compact-md"
              variant={buttonVariant}
              color={buttonColor}
              leftSection={<IconArrowsSort size={iconSize} />}
              aria-describedby={showIndicator ? activeLabelId : undefined}
              onClick={toggle}
            >
              Sort
            </Button>
          </Popover.Target>
        </Tooltip>
      </Indicator>
      {showIndicator && <VisuallyHidden id={activeLabelId}>{activeLabel}</VisuallyHidden>}
      <Popover.Dropdown className={classes.dropdown}>
        <div className={classes.body} tabIndex={-1} data-autofocus>
          {rows.length === 0 && <div className={classes.empty}>No sort applied</div>}
          {rows.map(({ id, rule }, index) => {
            const searchParam = rule.code ? searchParams[rule.code] : undefined;
            const labels = getDirectionLabels(searchParam);
            let directionValue: 'asc' | 'desc' | null = null;
            if (rule.code) {
              directionValue = rule.descending ? 'desc' : 'asc';
            }
            return (
              <div className={classes.row} key={id}>
                <Select
                  comboboxProps={{ withinPortal: false }}
                  className={classes.field}
                  aria-label={`Sort ${index + 1} field`}
                  placeholder="Field"
                  searchable
                  data={fieldData}
                  value={rule.code || null}
                  onChange={(code) => updateRule(index, { code: code ?? '', descending: rule.descending })}
                />
                <Select
                  comboboxProps={{ withinPortal: false }}
                  className={classes.direction}
                  aria-label={`Sort ${index + 1} direction`}
                  placeholder="Order"
                  disabled={!rule.code}
                  allowDeselect={false}
                  data={[
                    { value: 'asc', label: labels.asc },
                    { value: 'desc', label: labels.desc },
                  ]}
                  value={directionValue}
                  onChange={(dir) => updateRule(index, { code: rule.code, descending: dir === 'desc' })}
                />
                {isLastRow && !rowsAtDefault ? (
                  <Tooltip label="Reset to default" position="bottom" openDelay={500}>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      radius="xl"
                      aria-label="Reset sort to default"
                      ml={2}
                      onClick={resetToDefault}
                    >
                      <IconRotate2 size={16} stroke={2} className={classes.deleteIcon} />
                    </ActionIcon>
                  </Tooltip>
                ) : (
                  <ActionIcon
                    className={classes.deleteButton}
                    variant="subtle"
                    color="gray"
                    radius="xl"
                    aria-label={`Remove sort ${index + 1}`}
                    ml={2}
                    disabled={isLastRow}
                    onClick={() => deleteRule(index)}
                  >
                    <IconX size={16} stroke={2} className={classes.deleteIcon} />
                  </ActionIcon>
                )}
              </div>
            );
          })}
        </div>
        <div className={classes.footer}>
          <Button
            className={classes.addButton}
            size="compact-sm"
            variant="subtle"
            color="blue"
            leftSection={<IconCirclePlus size={16} />}
            fw={500}
            onClick={addRule}
          >
            Add Sort
          </Button>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

interface SortRow {
  readonly id: number;
  readonly rule: SortRule;
}

let nextSortRowId = 0;

function toRows(rules: SortRule[]): SortRow[] {
  return rules.map((rule) => ({ id: nextSortRowId++, rule }));
}

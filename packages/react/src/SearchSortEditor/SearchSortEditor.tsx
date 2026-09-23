// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Button, Indicator, Popover, Select } from '@mantine/core';
import type { SearchRequest, SortRule } from '@medplum/core';
import { deepClone, getSearchParameters } from '@medplum/core';
import type { SearchParameter } from '@medplum/fhirtypes';
import { IconArrowsSort, IconCirclePlus, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { buildSearchParamFieldLabel, isMetaSearchParam } from '../SearchControl/SearchUtils';
import classes from './SearchSortEditor.module.css';

export interface SearchSortEditorProps {
  readonly search: SearchRequest;
  readonly onChange: (search: SearchRequest) => void;
  readonly buttonVariant?: string;
  readonly buttonColor?: string;
  readonly buttonClassName?: string;
  readonly iconSize?: number;
}

/** The table's implicit default order (newest first) that the Sort indicator should not flag. */
const DEFAULT_SORT_CODE = '_lastUpdated';

/**
 * Returns true when the sort is the table default — no rules, or the single implicit
 * "Last Updated, newest first" rule — so the Sort button shows no active-sort indicator.
 * @param rules - The current sort rules.
 * @returns True if the sort matches the default order.
 */
function isDefaultSort(rules: readonly SortRule[]): boolean {
  return rules.length === 0 || (rules.length === 1 && rules[0].code === DEFAULT_SORT_CODE && !!rules[0].descending);
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
 * Popover-based sort builder for the {@link SearchControl} toolbar. Presents the sort rules as an
 * ordered list of `field + direction` rows that apply live as the user edits.
 * @param props - The sort editor props.
 * @returns The sort editor React node.
 */
export function SearchSortEditor(props: SearchSortEditorProps): JSX.Element {
  const { search, onChange } = props;
  const buttonVariant = props.buttonVariant ?? 'subtle';
  const buttonColor = props.buttonColor ?? 'gray';
  const iconSize = props.iconSize ?? 16;

  const [opened, setOpened] = useState(false);
  const [rules, setRules] = useState<SortRule[]>(() => deepClone(search.sortRules ?? []));

  const searchParams = useMemo(() => getSearchParameters(search.resourceType) ?? {}, [search.resourceType]);

  // Reset the working copy from the current search each time the popover opens, so it reflects
  // sort rules applied elsewhere without clobbering in-progress edits while open.
  function toggle(): void {
    if (!opened) {
      setRules(deepClone(search.sortRules ?? []));
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

  function emit(nextRules: SortRule[]): void {
    setRules(nextRules);
    const complete = nextRules.filter((r) => !!r.code);
    onChange({ ...search, sortRules: complete });
  }

  function updateRule(index: number, next: SortRule): void {
    const nextRules = [...rules];
    nextRules[index] = next;
    emit(nextRules);
  }

  function deleteRule(index: number): void {
    emit(rules.filter((_, i) => i !== index));
  }

  function addRule(): void {
    setRules([...rules, { code: '', descending: false }]);
  }

  // The Sort button flags only a non-default order. An empty sort, or the table's implicit default
  // (Last Updated, newest first), leaves the indicator dot off.
  const showIndicator = !isDefaultSort(search.sortRules ?? []);

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      shadow="md"
      radius="md"
      width={520}
      trapFocus={false}
      closeOnClickOutside
    >
      <Popover.Target>
        <Indicator className={classes.indicator} disabled={!showIndicator} color="blue" size={8} offset={6}>
          <Button
            className={props.buttonClassName}
            data-opened={opened || undefined}
            size="compact-md"
            variant={buttonVariant}
            color={buttonColor}
            leftSection={<IconArrowsSort size={iconSize} />}
            onClick={toggle}
          >
            Sort
          </Button>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown className={classes.dropdown}>
        <div className={classes.body}>
          {rules.length === 0 && <div className={classes.empty}>No sort applied</div>}
          {rules.map((rule, index) => {
            const searchParam = rule.code ? searchParams[rule.code] : undefined;
            const labels = getDirectionLabels(searchParam);
            return (
              <div className={classes.row} key={`sort-row-${index}`}>
                <Select
                  comboboxProps={{ withinPortal: false }}
                  className={classes.field}
                  aria-label={`sort-${index}-field`}
                  placeholder="Field"
                  searchable
                  data={fieldData}
                  value={rule.code || null}
                  onChange={(code) => updateRule(index, { code: code ?? '', descending: rule.descending })}
                />
                <Select
                  comboboxProps={{ withinPortal: false }}
                  className={classes.direction}
                  aria-label={`sort-${index}-direction`}
                  allowDeselect={false}
                  data={[
                    { value: 'asc', label: labels.asc },
                    { value: 'desc', label: labels.desc },
                  ]}
                  value={rule.descending ? 'desc' : 'asc'}
                  onChange={(dir) => updateRule(index, { code: rule.code, descending: dir === 'desc' })}
                />
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  radius="xl"
                  aria-label={`delete-sort-${index}`}
                  ml={4}
                  onClick={() => deleteRule(index)}
                >
                  <IconX size={16} stroke={2} color="var(--mantine-color-gray-7)" />
                </ActionIcon>
              </div>
            );
          })}
        </div>
        <div className={classes.footer}>
          <Button
            size="compact-sm"
            variant="subtle"
            color="blue"
            leftSection={<IconCirclePlus size={14} />}
            onClick={addRule}
          >
            Add another sort
          </Button>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

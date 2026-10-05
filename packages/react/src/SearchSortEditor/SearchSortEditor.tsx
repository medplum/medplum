// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Select } from '@mantine/core';
import type { SearchRequest, SortRule } from '@medplum/core';
import { getSearchParameters } from '@medplum/core';
import { IconArrowsSort, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { AddRowButton, SearchToolbarPopover } from '../SearchControl/SearchToolbarPopover';
import classes from '../SearchControl/SearchToolbarPopover.module.css';
import {
  DEFAULT_SORT_RULES,
  getSearchParamSelectData,
  getSortDirectionLabels,
  isSameSort,
} from '../SearchControl/SearchUtils';
import type { EditableRow } from '../SearchControl/useEditableRows';
import { useEditableRows } from '../SearchControl/useEditableRows';

export interface SearchSortEditorProps {
  readonly search: SearchRequest;
  readonly onChange: (search: SearchRequest) => void;
}

/**
 * Popover-based sort builder for the {@link SearchControl} toolbar: an ordered list of
 * `field + direction` rows that apply live as the user edits. Opens showing the default sort when
 * the search has no sort rules.
 * @param props - The sort editor props.
 * @returns The sort editor React node.
 */
export function SearchSortEditor(props: SearchSortEditorProps): JSX.Element {
  const { search, onChange } = props;
  const [opened, setOpened] = useState(false);
  const { rows, reset, update, remove, add } = useEditableRows(() => getInitialRules(search));
  const searchParams = useMemo(() => getSearchParameters(search.resourceType) ?? {}, [search.resourceType]);
  const fieldData = useMemo(() => getSearchParamSelectData(searchParams), [searchParams]);

  function toggle(): void {
    if (!opened) {
      reset(getInitialRules(search));
    }
    setOpened((o) => !o);
  }

  function emit(nextRows: EditableRow<SortRule>[]): void {
    onChange({ ...search, sortRules: nextRows.map((row) => row.value).filter((rule) => !!rule.code) });
  }

  const rules = search.sortRules ?? [];
  const activeLabel =
    rules.length > 0 && !isSameSort(rules, DEFAULT_SORT_RULES)
      ? `${rules.length} ${rules.length === 1 ? 'Sort' : 'Sorts'} Applied`
      : undefined;

  return (
    <SearchToolbarPopover
      label="Sort"
      icon={<IconArrowsSort size={16} />}
      width={520}
      opened={opened}
      onToggle={toggle}
      onChange={setOpened}
      activeLabel={activeLabel}
      footer={<AddRowButton label="Add Sort" onClick={() => add({ code: '', descending: false })} />}
    >
      <div className={classes.body} tabIndex={-1} data-autofocus>
        {rows.length === 0 && <div className={classes.empty}>No sort applied</div>}
        {rows.map(({ id, value: rule }, index) => {
          const labels = getSortDirectionLabels(rule.code ? searchParams[rule.code]?.type : undefined);
          const direction = rule.descending ? 'desc' : 'asc';
          return (
            <div className={classes.row} key={id}>
              <Select
                comboboxProps={{ withinPortal: false }}
                className={classes.grow}
                aria-label={`Sort ${index + 1} field`}
                placeholder="Field"
                searchable
                data={fieldData}
                value={rule.code || null}
                onChange={(code) => emit(update(index, { code: code ?? '', descending: rule.descending }))}
              />
              <Select
                comboboxProps={{ withinPortal: false }}
                className={classes.grow}
                aria-label={`Sort ${index + 1} direction`}
                placeholder="Order"
                disabled={!rule.code}
                allowDeselect={false}
                data={[
                  { value: 'asc', label: labels.asc },
                  { value: 'desc', label: labels.desc },
                ]}
                value={rule.code ? direction : null}
                onChange={(dir) => emit(update(index, { code: rule.code, descending: dir === 'desc' }))}
              />
              <ActionIcon
                variant="subtle"
                color="gray"
                radius="xl"
                aria-label={`Remove sort ${index + 1}`}
                ml={2}
                onClick={() => emit(remove(index))}
              >
                <IconX size={16} stroke={2} className={classes.deleteIcon} />
              </ActionIcon>
            </div>
          );
        })}
      </div>
    </SearchToolbarPopover>
  );
}

function getInitialRules(search: SearchRequest): SortRule[] {
  return search.sortRules?.length ? [...search.sortRules] : [...DEFAULT_SORT_RULES];
}

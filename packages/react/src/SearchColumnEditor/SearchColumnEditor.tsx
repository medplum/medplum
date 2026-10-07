// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Text, TextInput, UnstyledButton } from '@mantine/core';
import type { SearchRequest } from '@medplum/core';
import { getSearchParameters, tryGetDataType } from '@medplum/core';
import { IconCheck, IconColumns3, IconGripVertical, IconRotate2, IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo, useRef, useState } from 'react';
import { DEFAULT_SEARCH_FIELDS } from '../SearchControl/SearchControlField';
import { SearchToolbarPopover } from '../SearchControl/SearchToolbarPopover';
import popoverClasses from '../SearchControl/SearchToolbarPopover.module.css';
import { buildFieldNameString, buildSearchParamFieldLabel, partitionSearchParams } from '../SearchControl/SearchUtils';
import { useDragReorder } from '../utils/useDragReorder';
import classes from './SearchColumnEditor.module.css';

/**
 * Props for {@link SearchColumnEditor}.
 * `defaultFields` are the columns Reset Default restores; `DEFAULT_SEARCH_FIELDS` when omitted or empty.
 */
export interface SearchColumnEditorProps {
  readonly search: SearchRequest;
  readonly defaultFields?: readonly string[];
  readonly onChange: (search: SearchRequest) => void;
}

function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const next = [...array];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Builds the full ordered column universe: the currently-visible columns first (in their table
 * order), then every other column the resource exposes, fields then metadata, each sorted by label.
 * Like the former Fields modal, the universe is the union of the resource type's properties and its
 * search parameters. A property is skipped when a visible field already claims its code or label, and
 * a search parameter is skipped when a visible field or property does (e.g. `birthdate` vs `birthDate`,
 * `_id` vs `id`), so each column is offered once.
 * @param visibleFields - The columns currently shown, in table order.
 * @param resourceType - The resource type whose columns are listed.
 * @returns The ordered list of all known column names.
 */
function buildColumnOrder(visibleFields: readonly string[], resourceType: string): string[] {
  const keys = new Set(visibleFields.map((name) => name.toLowerCase()));
  const visibleNames = new Set(visibleFields.map(buildFieldNameString));
  const names = new Set(visibleNames);
  const others: string[] = [];

  for (const key of Object.keys(tryGetDataType(resourceType)?.elements ?? {})) {
    const name = buildFieldNameString(key);
    if (!keys.has(key.toLowerCase()) && !visibleNames.has(name)) {
      others.push(key);
      keys.add(key.toLowerCase());
      names.add(name);
    }
  }

  for (const code of Object.keys(getSearchParameters(resourceType) ?? {})) {
    const name = buildFieldNameString(code);
    if (!keys.has(code.toLowerCase()) && !names.has(name)) {
      others.push(code);
      keys.add(code.toLowerCase());
      names.add(name);
    }
  }

  const { fields, metadata } = partitionSearchParams(others);
  return [...visibleFields, ...fields, ...metadata];
}

/**
 * Popover-based column manager for the {@link SearchControl} toolbar. Lists every known column with
 * a drag handle (reorder) and a blue check (visible). Toggling a column shows/hides it in the table;
 * dragging a column up moves it left, dragging it down moves it right. Changes apply live. Hidden
 * columns are dropped from `SearchRequest.fields`, so they are remembered within a session but not
 * across a full reload. Reset Default restores `defaultFields`, or `DEFAULT_SEARCH_FIELDS` when none
 * are given, and is disabled while the table already shows them in that order.
 * @param props - The column editor props.
 * @returns The column editor React node.
 */
export function SearchColumnEditor(props: SearchColumnEditorProps): JSX.Element {
  const { search, onChange } = props;

  const visibleFields = useMemo(() => search.fields ?? DEFAULT_SEARCH_FIELDS, [search.fields]);
  const defaults = props.defaultFields?.length ? props.defaultFields : DEFAULT_SEARCH_FIELDS;
  const atDefaults = visibleFields.length === defaults.length && visibleFields.every((f, i) => f === defaults[i]);

  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<string[]>(() => buildColumnOrder(visibleFields, search.resourceType));
  const [orderResourceType, setOrderResourceType] = useState(search.resourceType);
  if (orderResourceType !== search.resourceType) {
    setOrderResourceType(search.resourceType);
    setOrder(buildColumnOrder(visibleFields, search.resourceType));
  }

  const searchInputRef = useRef<HTMLInputElement>(null);
  const drag = useDragReorder(reorder);

  const visibleSet = useMemo(() => new Set(visibleFields), [visibleFields]);
  const lowerQuery = query.toLowerCase();
  const listed = order.filter((name) => !query || buildSearchParamFieldLabel(name).toLowerCase().includes(lowerQuery));
  const visibleCount = order.filter((name) => visibleSet.has(name)).length;

  function toggleOpen(): void {
    if (!opened) {
      setQuery('');
      setOrder((prev) => {
        const visibleNames = new Set(visibleFields.map(buildFieldNameString));
        return [
          ...visibleFields,
          ...prev.filter((name) => !visibleSet.has(name) && !visibleNames.has(buildFieldNameString(name))),
        ];
      });
    }
    setOpened((o) => !o);
  }

  function emitFields(nextOrder: string[], nextVisible: Set<string>): void {
    onChange({ ...search, fields: nextOrder.filter((name) => nextVisible.has(name)) });
  }

  function toggleColumn(name: string): void {
    const nextVisible = new Set(visibleSet);
    if (nextVisible.has(name)) {
      if (nextVisible.size === 1) {
        return;
      }
      nextVisible.delete(name);
    } else {
      nextVisible.add(name);
    }
    emitFields(order, nextVisible);
  }

  function reorder(from: number, to: number): void {
    const nextOrder = arrayMove(order, from, to);
    setOrder(nextOrder);
    emitFields(nextOrder, visibleSet);
  }

  function resetDefault(): void {
    const next = [...defaults];
    setQuery('');
    searchInputRef.current?.focus();
    setOrder(buildColumnOrder(next, search.resourceType));
    onChange({ ...search, fields: next });
  }

  return (
    <SearchToolbarPopover
      label="Columns"
      icon={<IconColumns3 size={16} />}
      width={300}
      opened={opened}
      onToggle={toggleOpen}
      onChange={setOpened}
      footer={
        <>
          <Button
            className={`${classes.staticButton} ${popoverClasses.addButton}`}
            size="compact-sm"
            variant="subtle"
            color="gray"
            leftSection={<IconRotate2 size={16} />}
            fw={500}
            disabled={atDefaults}
            onClick={resetDefault}
          >
            Reset Default
          </Button>
          <Text className={classes.shownCount} size="sm">
            {visibleCount} shown
          </Text>
        </>
      }
    >
      <div className={classes.header}>
        <TextInput
          ref={searchInputRef}
          data-autofocus
          placeholder="Search columns"
          aria-label="Search columns"
          leftSection={<IconSearch size={16} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      </div>
      <div className={drag.dragIndex !== undefined ? `${classes.body} ${classes.dragActive}` : classes.body}>
        {order.map((name, index) => {
          if (!listed.includes(name)) {
            return null;
          }
          const visible = visibleSet.has(name);
          const { dragIndex, overIndex } = drag;
          const rowClass = [
            classes.item,
            dragIndex === index ? classes.dragging : '',
            overIndex === index && dragIndex !== undefined && dragIndex !== index ? classes.dragOver : '',
            overIndex === index && dragIndex !== undefined && dragIndex < index ? classes.dragOverBelow : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <UnstyledButton
              key={name}
              className={rowClass}
              aria-pressed={visible}
              data-testid={`column-${name}`}
              onClick={() => toggleColumn(name)}
              onPointerMove={() => drag.hover(index)}
            >
              <span
                className={classes.grip}
                aria-hidden="true"
                data-testid={`column-grip-${name}`}
                onPointerDown={(e) => drag.startDrag(e, index)}
                onClick={(e) => e.stopPropagation()}
              >
                <IconGripVertical size={16} stroke={1.5} />
              </span>
              <span className={classes.label}>{buildSearchParamFieldLabel(name)}</span>
              {visible && (
                <span className={classes.check} aria-hidden="true" data-testid={`visible-${name}`}>
                  <IconCheck size={16} stroke={2} />
                </span>
              )}
            </UnstyledButton>
          );
        })}
      </div>
    </SearchToolbarPopover>
  );
}

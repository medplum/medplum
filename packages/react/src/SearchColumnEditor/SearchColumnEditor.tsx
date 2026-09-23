// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Popover, Text, TextInput } from '@mantine/core';
import type { SearchRequest } from '@medplum/core';
import { getSearchParameters } from '@medplum/core';
import type { SearchParameter } from '@medplum/fhirtypes';
import { IconArrowBackUp, IconCheck, IconColumns3, IconGripVertical, IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo, useRef, useState } from 'react';
import { buildSearchParamFieldLabel, isMetaSearchParam } from '../SearchControl/SearchUtils';
import classes from './SearchColumnEditor.module.css';

/** Columns shown when a search has no explicit `fields`, mirroring {@link getFieldDefinitions}. */
const DEFAULT_FIELDS = ['id', '_lastUpdated'];

export interface SearchColumnEditorProps {
  readonly search: SearchRequest;
  readonly onChange: (search: SearchRequest) => void;
  readonly buttonVariant?: string;
  readonly buttonColor?: string;
  readonly buttonClassName?: string;
  readonly iconSize?: number;
}

function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const next = [...array];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Builds the full ordered column universe: the currently-visible columns first (in their table
 * order), then every other search parameter the resource exposes - Fields then Metadata, each
 * sorted by label - so the menu offers the same set of fields and metadata as the filter editor.
 * @param visibleFields - The columns currently shown, in table order.
 * @param searchParams - All search parameters for the resource type, keyed by code.
 * @returns The ordered list of all known column names.
 */
function buildColumnOrder(visibleFields: string[], searchParams: Record<string, SearchParameter>): string[] {
  const seen = new Set(visibleFields);
  const fields: string[] = [];
  const metadata: string[] = [];
  for (const code of Object.keys(searchParams)) {
    if (seen.has(code)) {
      continue;
    }
    seen.add(code);
    if (isMetaSearchParam(code)) {
      metadata.push(code);
    } else {
      fields.push(code);
    }
  }
  const byLabel = (a: string, b: string): number =>
    buildSearchParamFieldLabel(a).localeCompare(buildSearchParamFieldLabel(b));
  fields.sort(byLabel);
  metadata.sort(byLabel);
  return [...visibleFields, ...fields, ...metadata];
}

/**
 * Popover-based column manager for the {@link SearchControl} toolbar. Lists every known column with
 * a drag handle (reorder) and a blue check (visible). Toggling a column shows/hides it in the table;
 * dragging a column up moves it left, dragging it down moves it right. Changes apply live. Hidden
 * columns are dropped from `SearchRequest.fields`, so they are remembered within a session but not
 * across a full reload.
 * @param props - The column editor props.
 * @returns The column editor React node.
 */
export function SearchColumnEditor(props: SearchColumnEditorProps): JSX.Element {
  const { search, onChange } = props;
  const buttonVariant = props.buttonVariant ?? 'subtle';
  const buttonColor = props.buttonColor ?? 'gray';
  const iconSize = props.iconSize ?? 16;

  const visibleFields = useMemo(
    () => (search.fields && search.fields.length > 0 ? search.fields : DEFAULT_FIELDS),
    [search.fields]
  );

  const searchParams = useMemo(() => getSearchParameters(search.resourceType) ?? {}, [search.resourceType]);

  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  // Every known column - visible plus every available field/metadata - in display order.
  const [order, setOrder] = useState<string[]>(() => buildColumnOrder(visibleFields, searchParams));
  // The fields the page loaded with, used by "Reset default".
  const defaultFields = useRef<string[]>([...visibleFields]);

  // Pointer-drag state: the row being dragged and the current drop target. Pointer dragging (rather
  // than native HTML5 drag) lets CSS keep the grabbing cursor while the row moves.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  // Refs mirror the indices so the pointerup handler reads them synchronously, before a re-render lands.
  const dragIndexRef = useRef<number | null>(null);
  const overIndexRef = useRef<number | null>(null);

  const visibleSet = useMemo(() => new Set(visibleFields), [visibleFields]);
  const visibleCount = order.filter((name) => visibleSet.has(name)).length;

  function toggleOpen(): void {
    if (!opened) {
      setQuery('');
      // Merge any externally-added fields into the known column list before showing the menu.
      setOrder((prev) => {
        const merged = [...prev];
        for (const field of visibleFields) {
          if (!merged.includes(field)) {
            merged.push(field);
          }
        }
        return merged;
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
    const next = [...defaultFields.current];
    setOrder(buildColumnOrder(next, searchParams));
    onChange({ ...search, fields: next });
  }

  function clearDrag(): void {
    setDragIndex(null);
    setOverIndex(null);
    dragIndexRef.current = null;
    overIndexRef.current = null;
  }

  function startDrag(index: number): void {
    dragIndexRef.current = index;
    overIndexRef.current = index;
    setDragIndex(index);
    // Listen on the document so releasing anywhere (including outside the menu) ends the drag.
    const onPointerUp = (): void => {
      const from = dragIndexRef.current;
      const to = overIndexRef.current;
      if (from !== null && to !== null && from !== to) {
        reorder(from, to);
      }
      clearDrag();
      document.removeEventListener('pointerup', onPointerUp);
    };
    document.addEventListener('pointerup', onPointerUp);
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      shadow="md"
      radius="md"
      width={300}
      trapFocus
      closeOnClickOutside
    >
      <Popover.Target>
        <Button
          className={props.buttonClassName}
          data-opened={opened || undefined}
          size="compact-md"
          variant={buttonVariant}
          color={buttonColor}
          leftSection={<IconColumns3 size={iconSize} />}
          onClick={toggleOpen}
        >
          Columns
        </Button>
      </Popover.Target>
      <Popover.Dropdown className={classes.dropdown}>
        <div className={classes.header}>
          <TextInput
            data-autofocus
            placeholder="Search columns"
            aria-label="Search columns"
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
        </div>
        <div className={dragIndex !== null ? `${classes.body} ${classes.dragActive}` : classes.body}>
          {order.map((name, index) => {
            const label = buildSearchParamFieldLabel(name);
            if (query && !label.toLowerCase().includes(query.toLowerCase())) {
              return null;
            }
            const visible = visibleSet.has(name);
            const rowClass = [
              classes.item,
              dragIndex === index ? classes.dragging : '',
              overIndex === index && dragIndex !== null && dragIndex !== index ? classes.dragOver : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={name}
                className={rowClass}
                role="button"
                tabIndex={0}
                aria-label={`column-${name}`}
                onClick={() => toggleColumn(name)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleColumn(name);
                  }
                }}
                onPointerMove={() => {
                  if (dragIndexRef.current !== null && overIndexRef.current !== index) {
                    overIndexRef.current = index;
                    setOverIndex(index);
                  }
                }}
              >
                <span
                  className={classes.grip}
                  aria-hidden="true"
                  data-testid={`column-grip-${name}`}
                  onPointerDown={() => startDrag(index)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <IconGripVertical size={16} stroke={1.5} />
                </span>
                <span className={classes.label}>{label}</span>
                {visible && (
                  <span className={classes.check} aria-label={`visible-${name}`}>
                    <IconCheck size={16} stroke={2} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className={classes.footer}>
          <Button
            className={`${classes.staticButton} ${classes.addButton}`}
            size="compact-sm"
            variant="subtle"
            color="gray"
            leftSection={<IconArrowBackUp size={16} />}
            fw={500}
            onClick={resetDefault}
          >
            Reset default
          </Button>
          <Text size="sm" c="dimmed">
            {visibleCount} shown
          </Text>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

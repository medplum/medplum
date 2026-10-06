// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Text, TextInput, UnstyledButton, VisuallyHidden } from '@mantine/core';
import type { SearchRequest } from '@medplum/core';
import { getSearchParameters } from '@medplum/core';
import type { SearchParameter } from '@medplum/fhirtypes';
import { IconCheck, IconColumns3, IconGripVertical, IconRotate2, IconSearch } from '@tabler/icons-react';
import type { JSX, KeyboardEvent, PointerEvent } from 'react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SEARCH_FIELDS } from '../SearchControl/SearchControlField';
import { SearchToolbarPopover } from '../SearchControl/SearchToolbarPopover';
import popoverClasses from '../SearchControl/SearchToolbarPopover.module.css';
import { buildSearchParamFieldLabel, partitionSearchParams } from '../SearchControl/SearchUtils';
import classes from './SearchColumnEditor.module.css';

export interface SearchColumnEditorProps {
  readonly search: SearchRequest;
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
 * order), then every other search parameter the resource exposes, fields then metadata, each
 * sorted by label, so the menu offers the same set of fields and metadata as the filter editor.
 * @param visibleFields - The columns currently shown, in table order.
 * @param searchParams - All search parameters for the resource type, keyed by code.
 * @returns The ordered list of all known column names.
 */
function buildColumnOrder(visibleFields: readonly string[], searchParams: Record<string, SearchParameter>): string[] {
  const seen = new Set(visibleFields);
  const { fields, metadata } = partitionSearchParams(Object.keys(searchParams).filter((code) => !seen.has(code)));
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

  const visibleFields = useMemo(
    () => (search.fields && search.fields.length > 0 ? search.fields : DEFAULT_SEARCH_FIELDS),
    [search.fields]
  );

  const searchParams = useMemo(() => getSearchParameters(search.resourceType) ?? {}, [search.resourceType]);

  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<string[]>(() => buildColumnOrder(visibleFields, searchParams));
  const [defaultFields, setDefaultFields] = useState<string[]>(() => [...visibleFields]);
  const [orderResourceType, setOrderResourceType] = useState(search.resourceType);
  if (orderResourceType !== search.resourceType) {
    setOrderResourceType(search.resourceType);
    setOrder(buildColumnOrder(visibleFields, searchParams));
    setDefaultFields([...visibleFields]);
  }

  const [dragIndex, setDragIndex] = useState<number | undefined>(undefined);
  const [overIndex, setOverIndex] = useState<number | undefined>(undefined);
  const dragIndexRef = useRef<number | undefined>(undefined);
  const overIndexRef = useRef<number | undefined>(undefined);
  const endDragRef = useRef<(() => void) | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusRef = useRef<string | undefined>(undefined);
  const [announcement, setAnnouncement] = useState('');
  const reorderHintId = useId();

  useLayoutEffect(() => {
    if (pendingFocusRef.current) {
      itemRefs.current.get(pendingFocusRef.current)?.focus();
      pendingFocusRef.current = undefined;
    }
  });

  useEffect(() => () => endDragRef.current?.(), []);

  const visibleSet = useMemo(() => new Set(visibleFields), [visibleFields]);
  const lowerQuery = query.toLowerCase();
  const listed = order.filter((name) => !query || buildSearchParamFieldLabel(name).toLowerCase().includes(lowerQuery));
  const visibleCount = order.filter((name) => visibleSet.has(name)).length;

  function toggleOpen(): void {
    if (!opened) {
      setQuery('');
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

  /**
   * Moves a column one step up or down among the columns currently listed (Alt+Up / Alt+Down).
   * @param e - The keydown event.
   * @param name - The column being moved.
   * @param listedNames - The column names currently listed, in order.
   */
  function handleItemKeyDown(e: KeyboardEvent<HTMLButtonElement>, name: string, listedNames: string[]): void {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) {
      return;
    }
    e.preventDefault();
    const position = listedNames.indexOf(name);
    const neighbor = listedNames[e.key === 'ArrowUp' ? position - 1 : position + 1];
    if (!neighbor) {
      return;
    }
    pendingFocusRef.current = name;
    reorder(order.indexOf(name), order.indexOf(neighbor));
    const newPosition = e.key === 'ArrowUp' ? position : position + 2;
    setAnnouncement(`${buildSearchParamFieldLabel(name)} moved to position ${newPosition} of ${listedNames.length}`);
  }

  function resetDefault(): void {
    const next = [...defaultFields];
    setQuery('');
    searchInputRef.current?.focus();
    setOrder(buildColumnOrder(next, searchParams));
    onChange({ ...search, fields: next });
  }

  function clearDrag(): void {
    setDragIndex(undefined);
    setOverIndex(undefined);
    dragIndexRef.current = undefined;
    overIndexRef.current = undefined;
  }

  /**
   * Starts a pointer drag from a row's grip. The drop target is tracked by the rows' pointermove
   * handlers, and the drag ends on the next pointerup or pointercancel anywhere in the document.
   * @param e - The pointerdown event on the grip.
   * @param index - The index of the dragged row in `order`.
   */
  function startDrag(e: PointerEvent<HTMLElement>, index: number): void {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    endDragRef.current?.();
    dragIndexRef.current = index;
    overIndexRef.current = index;
    setDragIndex(index);
    const removeListeners = (): void => {
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerCancel);
      endDragRef.current = undefined;
    };
    const onPointerUp = (): void => {
      const from = dragIndexRef.current;
      const to = overIndexRef.current;
      removeListeners();
      if (from !== undefined && to !== undefined && from !== to) {
        reorder(from, to);
      }
      clearDrag();
    };
    const onPointerCancel = (): void => {
      removeListeners();
      clearDrag();
    };
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
    endDragRef.current = removeListeners;
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
      <VisuallyHidden id={reorderHintId}>Press Alt+Up or Alt+Down to reorder</VisuallyHidden>
      <VisuallyHidden aria-live="polite">{announcement}</VisuallyHidden>
      <div className={dragIndex !== undefined ? `${classes.body} ${classes.dragActive}` : classes.body}>
        {order.map((name, index) => {
          if (!listed.includes(name)) {
            return null;
          }
          const visible = visibleSet.has(name);
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
              ref={(el: HTMLButtonElement | null) => {
                if (el) {
                  itemRefs.current.set(name, el);
                } else {
                  itemRefs.current.delete(name);
                }
              }}
              className={rowClass}
              aria-pressed={visible}
              aria-describedby={reorderHintId}
              data-testid={`column-${name}`}
              onClick={() => toggleColumn(name)}
              onKeyDown={(e) => handleItemKeyDown(e, name, listed)}
              onPointerMove={() => {
                if (dragIndexRef.current !== undefined && overIndexRef.current !== index) {
                  overIndexRef.current = index;
                  setOverIndex(index);
                }
              }}
            >
              <span
                className={classes.grip}
                aria-hidden="true"
                data-testid={`column-grip-${name}`}
                onPointerDown={(e) => startDrag(e, index)}
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

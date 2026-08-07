// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Group, Loader, Radio, Stack, Text, TextInput } from '@mantine/core';
import { IconCheck, IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import classes from './AppointmentFinder.module.css';

export interface AppointmentPickListItem {
  /** Identifies the row, and is what `onSelect` reports. */
  readonly id: string;
  readonly label: string;
  /** A quieter second line: where a site is, or what a service is for. */
  readonly description?: string;
}

export interface AppointmentPickListProps {
  readonly label: string;
  readonly items: readonly AppointmentPickListItem[];
  readonly onSelect: (id: string) => void;
  readonly selectedId?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly error?: string;
  /** Shown in place of the rows when there are none. */
  readonly emptyMessage: string;
  /**
   * Search text. Filtering is the caller's, since a list long enough to need
   * searching is narrowed by the server rather than in the browser.
   */
  readonly query?: string;
  /**
   * Reports the search text. Left out, the list has no search field, which suits
   * a set short enough to read down in one go.
   */
  readonly onQueryChange?: (query: string) => void;
  readonly searchPlaceholder?: string;
  /** A quiet line under the rows, for saying what the list has been narrowed to. */
  readonly footnote?: string;
}

/**
 * A list of rows to choose one of.
 *
 * Chosen over a dropdown because both of the things a booking starts with — the
 * site and the visit type — are picked from a set the scheduler already knows,
 * and is faster to read down than to type into. The search field appears only
 * where the caller can use it: a practice has a handful of sites and no need to
 * search them, and as many visit types as it has ways of being busy.
 *
 * Built on Mantine's `Radio.Group` and `Radio.Card`, which supply the
 * radiogroup semantics and the checked styling: only one row can be chosen, and
 * a screen reader says which one is.
 *
 * @param props - The React props.
 * @returns The labelled list.
 */
export function AppointmentPickList(props: AppointmentPickListProps): JSX.Element {
  const { label, items, onSelect, selectedId, required, disabled, loading, error, query, onQueryChange } = props;
  const showRows = !loading && !error && items.length > 0;

  return (
    <Radio.Group value={selectedId ?? null} onChange={onSelect} label={label} required={required}>
      <Stack gap="xs" mt={6}>
        {onQueryChange && (
          <TextInput
            size="sm"
            value={query ?? ''}
            disabled={disabled}
            placeholder={props.searchPlaceholder ?? `Search ${label.toLowerCase()}`}
            aria-label={`Search ${label.toLowerCase()}`}
            leftSection={<IconSearch size={14} stroke={1.8} />}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
          />
        )}

        {error && (
          <Alert color="red" title={`Could not load ${label.toLowerCase()}`}>
            {error}
          </Alert>
        )}

        {loading && <Loader size="sm" />}

        {!loading && !error && items.length === 0 && (
          <Text size="sm" c="dimmed">
            {props.emptyMessage}
          </Text>
        )}

        {showRows && (
          <div className={classes.pickList}>
            {items.map((item) => (
              <Radio.Card key={item.id} value={item.id} disabled={disabled} radius={0} className={classes.pickRow}>
                <Group gap="sm" wrap="nowrap">
                  <div className={classes.pickRowBody}>
                    <Text size="sm" truncate>
                      {item.label}
                    </Text>
                    {item.description && (
                      <Text size="xs" c="dimmed" truncate>
                        {item.description}
                      </Text>
                    )}
                  </div>
                  {item.id === selectedId && <IconCheck size={16} stroke={2} className={classes.pickRowCheck} />}
                </Group>
              </Radio.Card>
            ))}
          </div>
        )}

        {props.footnote && (
          <Text size="xs" c="dimmed">
            {props.footnote}
          </Text>
        )}
      </Stack>
    </Radio.Group>
  );
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Anchor,
  Button,
  Checkbox,
  Code,
  Combobox,
  Divider,
  Group,
  InputBase,
  InputWrapper,
  NativeSelect,
  Stack,
  Text,
  useCombobox,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconArrowDown, IconArrowUp, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from './db/SearchableSelect';
import { useAvailableTables } from './db/useAvailableTables';
import {
  buildHypotheticalIndexSql,
  createHypotheticalIndexDraft,
  HYPOPG_ACCESS_METHODS,
  supportsUnique,
} from './hypotheticalIndexSql';
import type { HypopgAccessMethod, HypotheticalIndexDraft } from './hypotheticalIndexSql';

const HYPOPG_DOCS_URL = 'https://hypopg.readthedocs.io/';

interface TableColumn {
  readonly name: string;
  readonly type: string;
}

const MAX_DISPLAYED_COLUMNS = 8;

function parseColumnStatistics(params: Parameters): TableColumn[] {
  const tablePart = params.parameter?.find((p) => p.name === 'table')?.part ?? [];
  const columns: TableColumn[] = [];
  for (const column of tablePart) {
    if (column.name !== 'column') {
      continue;
    }
    const name = column.part?.find((p) => p.name === 'name')?.valueString;
    if (!name) {
      continue;
    }
    columns.push({
      name,
      type: column.part?.find((p) => p.name === 'type')?.valueString ?? '',
    });
  }
  columns.sort((a, b) => a.name.localeCompare(b.name));
  return columns;
}

function columnAdderPlaceholder(tableName: string, loading: boolean): string {
  if (!tableName) {
    return 'Choose a table first';
  }
  if (loading) {
    return 'Loading columns…';
  }
  return 'Column name';
}

function moveColumn(columns: readonly string[], index: number, direction: -1 | 1): string[] {
  const next = index + direction;
  if (next < 0 || next >= columns.length) {
    return [...columns];
  }
  const copy = [...columns];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}

export function HypotheticalIndexBuilder({
  drafts,
  onChange,
}: {
  readonly drafts: readonly HypotheticalIndexDraft[];
  readonly onChange: (drafts: HypotheticalIndexDraft[]) => void;
}): JSX.Element {
  const medplum = useMedplum();
  const [tables, setTables] = useState<string[]>([]);
  useAvailableTables({ medplum, onChange: setTables });

  const { sql } = buildHypotheticalIndexSql(drafts);

  function updateDraft(id: string, next: HypotheticalIndexDraft): void {
    onChange(drafts.map((draft) => (draft.id === id ? next : draft)));
  }

  return (
    <InputWrapper
      label="Hypothetical indexes (HypoPG)"
      description={
        <>
          Optional. Each index is passed to <Code>hypopg_create_index()</Code>. History tables are listed as{' '}
          <Code>Patient_History</Code> and use that table's columns. Supported access methods are btree, brin,
          hash, and bloom. GiST and GIN are not supported. See the{' '}
          <Anchor href={HYPOPG_DOCS_URL} target="_blank" rel="noopener noreferrer">
            HypoPG documentation
          </Anchor>
          .
        </>
      }
    >
      <Stack gap="sm" mt="xs">
        {drafts.map((draft, index) => (
          <Stack key={draft.id} gap="sm">
            {drafts.length > 1 && (
              <Group justify="space-between">
                <Text fw={500}>Index {index + 1}</Text>
                <Button
                  type="button"
                  variant="subtle"
                  size="compact-xs"
                  onClick={() => onChange(drafts.filter((item) => item.id !== draft.id))}
                >
                  Remove
                </Button>
              </Group>
            )}
            <HypotheticalIndexFields
              draft={draft}
              tables={tables}
              labelSuffix={drafts.length > 1 ? ` ${index + 1}` : ''}
              onChange={(next) => updateDraft(draft.id, next)}
            />
            {index < drafts.length - 1 && <Divider />}
          </Stack>
        ))}
        <Button type="button" variant="light" onClick={() => onChange([...drafts, createHypotheticalIndexDraft()])}>
          Add index
        </Button>
        {sql && (
          <div>
            <Text size="sm" fw={500} mb={4}>
              Preview
            </Text>
            <Code block style={{ whiteSpace: 'pre-wrap' }}>
              {sql}
            </Code>
          </div>
        )}
      </Stack>
    </InputWrapper>
  );
}

function HypotheticalIndexFields({
  draft,
  tables,
  labelSuffix,
  onChange,
}: {
  readonly draft: HypotheticalIndexDraft;
  readonly tables: string[];
  readonly labelSuffix: string;
  readonly onChange: (draft: HypotheticalIndexDraft) => void;
}): JSX.Element {
  const medplum = useMedplum();
  const [loadedColumns, setLoadedColumns] = useState<{ tableName: string; columns: TableColumn[] } | undefined>();

  useEffect(() => {
    const tableName = draft.tableName;
    let cancelled = false;
    if (tableName) {
      medplum
        .get<Parameters>(`fhir/R4/$db-column-statistics?tableName=${encodeURIComponent(tableName)}`, {
          cache: 'no-cache',
        })
        .then((params) => {
          if (!cancelled) {
            setLoadedColumns({ tableName, columns: parseColumnStatistics(params) });
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setLoadedColumns({ tableName, columns: [] });
            showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [medplum, draft.tableName]);

  const availableColumns = useMemo(
    () => (loadedColumns?.tableName === draft.tableName ? loadedColumns.columns : []),
    [draft.tableName, loadedColumns]
  );
  const loadingColumns = Boolean(draft.tableName) && loadedColumns?.tableName !== draft.tableName;

  const columnType = useMemo(() => {
    const types = new Map<string, string>();
    for (const column of availableColumns) {
      types.set(column.name, column.type);
    }
    return types;
  }, [availableColumns]);

  const remainingColumns = availableColumns.filter((column) => !draft.columns.includes(column.name));
  const uniqueEnabled = supportsUnique(draft.accessMethod);

  return (
    <Stack gap="sm">
      <SearchableSelect
        data={tables}
        inputProps={{ label: `Table${labelSuffix}`, placeholder: 'e.g. Appointment or Appointment_History' }}
        onChange={(tableName) => {
          if (tableName === draft.tableName) {
            return;
          }
          onChange({ ...draft, tableName, columns: [] });
        }}
      />
      <InputWrapper label={`Columns${labelSuffix}`} description="Index order. The first column is the btree prefix.">
        <Stack gap="xs" mt={4}>
          {draft.columns.map((name, index) => (
            <Group key={`${name}-${index}`} gap="xs" wrap="nowrap">
              <Text w={24} ta="right">
                {index + 1}.
              </Text>
              <Text style={{ flex: 1 }}>
                {name}
                {columnType.get(name) ? (
                  <Text span c="dimmed">
                    {' '}
                    ({columnType.get(name)})
                  </Text>
                ) : null}
              </Text>
              <ActionIcon
                type="button"
                variant="default"
                size="sm"
                aria-label={`Move ${name} up`}
                disabled={index === 0}
                onClick={() => onChange({ ...draft, columns: moveColumn(draft.columns, index, -1) })}
              >
                <IconArrowUp size={14} />
              </ActionIcon>
              <ActionIcon
                type="button"
                variant="default"
                size="sm"
                aria-label={`Move ${name} down`}
                disabled={index === draft.columns.length - 1}
                onClick={() => onChange({ ...draft, columns: moveColumn(draft.columns, index, 1) })}
              >
                <IconArrowDown size={14} />
              </ActionIcon>
              <ActionIcon
                type="button"
                variant="default"
                size="sm"
                aria-label={`Remove ${name}`}
                onClick={() => onChange({ ...draft, columns: draft.columns.filter((_, i) => i !== index) })}
              >
                <IconX size={14} />
              </ActionIcon>
            </Group>
          ))}
          <ColumnAdder
            label={`Add column${labelSuffix}`}
            columns={remainingColumns}
            disabled={!draft.tableName || loadingColumns}
            placeholder={columnAdderPlaceholder(draft.tableName, loadingColumns)}
            onAdd={(name) => {
              if (draft.columns.includes(name)) {
                return;
              }
              onChange({ ...draft, columns: [...draft.columns, name] });
            }}
          />
        </Stack>
      </InputWrapper>
      <NativeSelect
        label={`Access method${labelSuffix}`}
        value={draft.accessMethod}
        data={[...HYPOPG_ACCESS_METHODS]}
        onChange={(event) => {
          const accessMethod = event.currentTarget.value as HypopgAccessMethod;
          onChange({
            ...draft,
            accessMethod,
            unique: supportsUnique(accessMethod) ? draft.unique : false,
          });
        }}
      />
      <Checkbox
        label={`Unique${labelSuffix}`}
        description="Available for btree and hash."
        checked={uniqueEnabled && draft.unique}
        disabled={!uniqueEnabled}
        onChange={(event) => onChange({ ...draft, unique: event.currentTarget.checked })}
      />
    </Stack>
  );
}

function ColumnAdder({
  label,
  columns,
  disabled,
  placeholder,
  onAdd,
}: {
  readonly label: string;
  readonly columns: readonly TableColumn[];
  readonly disabled: boolean;
  readonly placeholder: string;
  readonly onAdd: (name: string) => void;
}): JSX.Element {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return columns.filter(
      (column) => column.name.toLowerCase().includes(needle) || column.type.toLowerCase().includes(needle)
    );
  }, [columns, search]);

  const displayed = filtered.slice(0, MAX_DISPLAYED_COLUMNS);

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(name) => {
        onAdd(name);
        setSearch('');
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          label={label}
          placeholder={placeholder}
          disabled={disabled}
          rightSection={<Combobox.Chevron />}
          rightSectionPointerEvents="none"
          value={search}
          onChange={(event) => {
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
            setSearch(event.currentTarget.value);
          }}
          onClick={() => {
            if (!disabled) {
              combobox.openDropdown();
            }
          }}
          onFocus={() => {
            if (!disabled) {
              combobox.openDropdown();
            }
          }}
          onBlur={() => {
            combobox.closeDropdown();
            setSearch('');
          }}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {displayed.length > 0 ? (
            displayed.map((column) => (
              <Combobox.Option value={column.name} key={column.name}>
                {column.type ? `${column.name} (${column.type})` : column.name}
              </Combobox.Option>
            ))
          ) : (
            <Combobox.Empty>Nothing found</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

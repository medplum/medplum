// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Box,
  CloseButton,
  Flex,
  Group,
  NativeSelect,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import type { ConceptMap, ConceptMapGroup, ConceptMapGroupElement } from '@medplum/fhirtypes';
import { IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import classes from './ConceptMapMappingsTable.module.css';
import type { ElementFilter, Equivalence } from './utils';
import { equivalenceColor, matchesFilter, matchesSearch } from './utils';

/**
 * Read-only rows are far cheaper than editable ones, so this cap is higher than the builder's.
 * It still exists because a six-column table of 100k rows will lock up the browser.
 */
const TABLE_RENDER_CAP = 1000;

export interface ConceptMapMappingsTableProps {
  readonly value: ConceptMap;
}

/**
 * Read-only view of a ConceptMap's mappings as one table per source→target system pair.
 *
 * Source code and display get their own columns, and a source code mapped to several targets
 * spans its rows, so 1:many mappings read as a single logical row. Used for maps too large for
 * the visual builder, where a scannable table beats a grid of disabled inputs.
 * @param props - The ConceptMapMappingsTable React props.
 * @returns The ConceptMapMappingsTable React node.
 */
export function ConceptMapMappingsTable(props: ConceptMapMappingsTableProps): JSX.Element {
  const groups = props.value.group ?? [];
  const [filter, setFilter] = useState<ElementFilter>('all');
  const [search, setSearch] = useState('');

  if (groups.length === 0) {
    return <Text c="dimmed">No mappings defined in this ConceptMap.</Text>;
  }

  return (
    <Stack gap="xl">
      <Flex justify="flex-end" wrap="wrap" gap="sm">
        <Group gap="xs">
          <TextInput
            aria-label="Search mappings"
            size="xs"
            w={240}
            placeholder="Search code, display, or comment"
            value={search}
            // The table can render inside the builder's form; Enter must not submit it.
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
              }
            }}
            onChange={(e) => setSearch(e.currentTarget.value)}
            rightSection={
              search ? <CloseButton size="xs" aria-label="Clear search" onClick={() => setSearch('')} /> : undefined
            }
          />
          <NativeSelect
            aria-label="Filter mappings"
            size="xs"
            w={140}
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value as ElementFilter)}
            data={[
              { value: 'all', label: 'All' },
              { value: 'mapped', label: 'Mapped' },
              { value: 'unmapped', label: 'Unmapped' },
              { value: 'nomap', label: 'No-map' },
            ]}
          />
        </Group>
      </Flex>
      {groups.map((group, index) => (
        <GroupTable key={group.id ?? index} group={group} groupIndex={index} filter={filter} search={search} />
      ))}
    </Stack>
  );
}

interface GroupTableProps {
  readonly group: ConceptMapGroup;
  readonly groupIndex: number;
  readonly filter: ElementFilter;
  readonly search: string;
}

function GroupTable(props: GroupTableProps): JSX.Element {
  const { group } = props;
  const elements = group.element ?? [];
  const filtered = elements.filter((e) => matchesFilter(e, props.filter) && matchesSearch(e, props.search));
  const narrowed = props.filter !== 'all' || props.search.trim().length > 0;
  const capped = filtered.slice(0, TABLE_RENDER_CAP);
  const rows = capped.flatMap(buildRows);

  const ordinal = `Group ${props.groupIndex + 1}`;

  return (
    <Stack
      gap="xs"
      role="group"
      // Each section repeats the same column names; naming the group tells a screen reader which
      // source→target pair it has entered.
      aria-label={group.source && group.target ? `${ordinal}: ${group.source} to ${group.target}` : ordinal}
    >
      <Text component="h3" fw={600} size="sm">
        {ordinal}
      </Text>
      <Text size="sm">
        <span className={classes.systemUri}>{systemLabel(group.source, group.sourceVersion, 'source')}</span>
        <Text component="span" size="sm" c="dimmed" mx="xs">
          →
        </Text>
        <span className={classes.systemUri}>{systemLabel(group.target, group.targetVersion, 'target')}</span>
      </Text>

      <Text size="xs" c="dimmed" data-testid="table-group-count">
        {elements.length.toLocaleString()} source {elements.length === 1 ? 'code' : 'codes'}
        {narrowed && ` · ${filtered.length.toLocaleString()} shown`}
      </Text>

      {filtered.length > TABLE_RENDER_CAP && (
        <Alert icon={<IconInfoCircle size={16} />} color="blue" data-testid="table-render-cap-banner">
          Showing {TABLE_RENDER_CAP.toLocaleString()} of {filtered.length.toLocaleString()} source codes. Search or
          filter to narrow the list — browser find-in-page only sees the rows rendered here.
        </Alert>
      )}

      {filtered.length === 0 ? (
        <Text size="sm" c="dimmed" fs="italic" data-testid="table-no-matches">
          {narrowed ? 'No mappings match the current search and filter.' : 'This group has no mappings.'}
        </Text>
      ) : (
        <Box className={classes.tableWrap}>
          <Table className={classes.mappingTable} striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Source code</Table.Th>
                <Table.Th>Source display</Table.Th>
                <Table.Th>Relationship</Table.Th>
                <Table.Th>Target code</Table.Th>
                <Table.Th>Target display</Table.Th>
                <Table.Th>Comment</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr key={row.key}>
                  {row.isFirstTargetForSource && (
                    <>
                      <Table.Td rowSpan={row.sourceRowSpan} className={classes.sourceCell}>
                        <Text size="sm" ff="monospace">
                          {row.sourceCode || '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td rowSpan={row.sourceRowSpan} className={classes.sourceCell}>
                        <Text size="sm">{row.sourceDisplay || '—'}</Text>
                      </Table.Td>
                    </>
                  )}
                  <Table.Td>
                    {row.equivalence ? (
                      <Badge variant="light" color={equivalenceColor(row.equivalence)}>
                        {row.equivalence}
                      </Badge>
                    ) : (
                      <Text size="sm" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" ff="monospace">
                      {row.targetCode || '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{row.targetDisplay || '—'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {row.comment}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}

      {group.unmapped && (
        <Text size="sm" c="dimmed" data-testid="table-unmapped-rule">
          <Text component="span" fw={600}>
            Fallback rule for codes not listed above:{' '}
          </Text>
          mode={group.unmapped.mode}
          {group.unmapped.code && `, code=${group.unmapped.code}`}
          {group.unmapped.display && ` (${group.unmapped.display})`}
          {group.unmapped.url && `, fallback map=${group.unmapped.url}`}
        </Text>
      )}
    </Stack>
  );
}

function systemLabel(system: string | undefined, version: string | undefined, kind: string): string {
  if (!system) {
    return `(unspecified ${kind})`;
  }
  return version ? `${system} (v${version})` : system;
}

interface MappingRow {
  readonly key: string;
  readonly sourceCode: string;
  readonly sourceDisplay: string;
  readonly targetCode: string;
  readonly targetDisplay: string;
  readonly equivalence: Equivalence | undefined;
  readonly comment: string;
  readonly isFirstTargetForSource: boolean;
  readonly sourceRowSpan: number;
}

// Flattens one element into one row per target, or a single placeholder row when it has none.
// `element.target` is optional in FHIR, so an unmapped source code still gets a visible row.
function buildRows(element: ConceptMapGroupElement, elementIndex: number): MappingRow[] {
  const sourceCode = element.code ?? '';
  const sourceDisplay = element.display ?? '';
  const targets = element.target ?? [];
  const keyBase = element.id ?? `${sourceCode}-${elementIndex}`;

  if (targets.length === 0) {
    return [
      {
        key: keyBase,
        sourceCode,
        sourceDisplay,
        targetCode: '',
        targetDisplay: '',
        equivalence: undefined,
        comment: '',
        isFirstTargetForSource: true,
        sourceRowSpan: 1,
      },
    ];
  }

  return targets.map((target, index) => ({
    key: `${keyBase}-${target.id ?? index}`,
    sourceCode,
    sourceDisplay,
    targetCode: target.code ?? '',
    targetDisplay: target.display ?? '',
    equivalence: target.equivalence,
    comment: target.comment ?? '',
    isFirstTargetForSource: index === 0,
    sourceRowSpan: targets.length,
  }));
}

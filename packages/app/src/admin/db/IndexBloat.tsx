// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Group, NumberInput, Stack, Table, Text, Title, UnstyledButton } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Parameters, ParametersParameter } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { formatBytes } from './utils';

const BYTES_PER_MEGABYTE = 1024 * 1024;

interface IndexBloatInfo {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexType: string;
  indexSize: number;
  estimatedBloatSize: number;
  bloatPercent: number;
}

type SortKey = keyof Pick<
  IndexBloatInfo,
  'schemaName' | 'tableName' | 'indexName' | 'indexType' | 'indexSize' | 'estimatedBloatSize' | 'bloatPercent'
>;
type SortDirection = 'asc' | 'desc';

export function IndexBloat(): JSX.Element {
  const medplum = useMedplum();
  const [minBloatPercent, setMinBloatPercent] = useState<number | string>(30);
  const [minBloatMegabytes, setMinBloatMegabytes] = useState<number | string>(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [indexes, setIndexes] = useState<IndexBloatInfo[] | undefined>();
  const [sortKey, setSortKey] = useState<SortKey>('estimatedBloatSize');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const sortedIndexes = useMemo(() => {
    return [...(indexes ?? [])].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];
      const comparison =
        typeof aValue === 'number' && typeof bValue === 'number'
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue));
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [indexes, sortDirection, sortKey]);

  const analyze = (): void => {
    if (typeof minBloatPercent !== 'number' || typeof minBloatMegabytes !== 'number') {
      return;
    }

    const query = new URLSearchParams({
      minBloatPercent: String(minBloatPercent),
      minBloatBytes: String(Math.round(minBloatMegabytes * BYTES_PER_MEGABYTE)),
    });
    setError(undefined);
    setLoading(true);
    medplum
      .get(`fhir/R4/$db-index-bloat?${query}`, { cache: 'no-cache' })
      .then((response: Parameters) => {
        setIndexes(
          response.parameter?.filter((parameter) => parameter.name === 'index').map(parseIndexBloatInfo) ?? []
        );
      })
      .catch((err: unknown) => {
        const message = normalizeErrorString(err);
        setError(message);
        showNotification({ color: 'red', message, autoClose: false });
      })
      .finally(() => setLoading(false));
  };

  const toggleSort = (key: SortKey): void => {
    if (key === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(
        key === 'schemaName' || key === 'tableName' || key === 'indexName' || key === 'indexType' ? 'asc' : 'desc'
      );
    }
  };

  const inputsValid =
    typeof minBloatPercent === 'number' &&
    minBloatPercent >= 0 &&
    minBloatPercent <= 100 &&
    typeof minBloatMegabytes === 'number' &&
    minBloatMegabytes >= 0;

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Index bloat</Title>
        <Text c="dimmed" size="sm">
          B-tree and GIN bloat values are estimates. Analysis reads index pages and may take time on a large database.
          GIN estimates depend on statistics updated by VACUUM.
        </Text>
      </div>
      <Group align="end">
        <NumberInput
          label="Minimum bloat"
          suffix="%"
          value={minBloatPercent}
          onChange={setMinBloatPercent}
          min={0}
          max={100}
          decimalScale={2}
          w={180}
        />
        <NumberInput
          label="Minimum reclaimable size"
          suffix=" MB"
          value={minBloatMegabytes}
          onChange={setMinBloatMegabytes}
          min={0}
          decimalScale={2}
          w={240}
        />
        <Button loading={loading} disabled={!inputsValid} onClick={analyze}>
          Analyze
        </Button>
      </Group>

      {error && (
        <Alert color="red" title="Analysis failed">
          {error}
        </Alert>
      )}

      {indexes === undefined && !loading && <Text c="dimmed">Click Analyze to scan indexes for bloat.</Text>}
      {indexes?.length === 0 && !loading && <Text c="dimmed">No indexes exceed both thresholds.</Text>}
      {indexes && indexes.length > 0 && (
        <Table.ScrollContainer minWidth={900}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <SortableHeader
                  label="Schema"
                  sortKey="schemaName"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={toggleSort}
                />
                <SortableHeader
                  label="Table"
                  sortKey="tableName"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={toggleSort}
                />
                <SortableHeader
                  label="Index"
                  sortKey="indexName"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={toggleSort}
                />
                <SortableHeader
                  label="Type"
                  sortKey="indexType"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={toggleSort}
                />
                <SortableHeader
                  label="Index size"
                  sortKey="indexSize"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={toggleSort}
                />
                <SortableHeader
                  label="Estimated bloat"
                  sortKey="estimatedBloatSize"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={toggleSort}
                />
                <SortableHeader
                  label="Bloat"
                  sortKey="bloatPercent"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={toggleSort}
                />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sortedIndexes.map((index) => (
                <Table.Tr key={`${index.schemaName}.${index.indexName}`}>
                  <Table.Td>{index.schemaName}</Table.Td>
                  <Table.Td>{index.tableName}</Table.Td>
                  <Table.Td>{index.indexName}</Table.Td>
                  <Table.Td>{index.indexType.toUpperCase()}</Table.Td>
                  <Table.Td>{formatBytes(index.indexSize)}</Table.Td>
                  <Table.Td>{formatBytes(index.estimatedBloatSize)}</Table.Td>
                  <Table.Td>{index.bloatPercent.toFixed(2)}%</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}

interface SortableHeaderProps {
  readonly label: string;
  readonly sortKey: SortKey;
  readonly activeKey: SortKey;
  readonly direction: SortDirection;
  readonly onSort: (key: SortKey) => void;
}

function SortableHeader({ label, sortKey, activeKey, direction, onSort }: SortableHeaderProps): JSX.Element {
  return (
    <Table.Th>
      <UnstyledButton
        onClick={() => onSort(sortKey)}
        style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        {label}
        {activeKey === sortKey && (direction === 'desc' ? <IconArrowDown size={14} /> : <IconArrowUp size={14} />)}
      </UnstyledButton>
    </Table.Th>
  );
}

function parseIndexBloatInfo(parameter: ParametersParameter): IndexBloatInfo {
  const parts = parameter.part ?? [];
  return {
    schemaName: getStringPart(parts, 'schemaName'),
    tableName: getStringPart(parts, 'tableName'),
    indexName: getStringPart(parts, 'indexName'),
    indexType: getStringPart(parts, 'indexType'),
    indexSize: getNumberPart(parts, 'indexSize'),
    estimatedBloatSize: getNumberPart(parts, 'estimatedBloatSize'),
    bloatPercent: getNumberPart(parts, 'bloatPercent'),
  };
}

function getStringPart(parts: ParametersParameter[], name: string): string {
  const part = parts.find((candidate) => candidate.name === name);
  return part?.valueString ?? part?.valueCode ?? '';
}

function getNumberPart(parts: ParametersParameter[], name: string): number {
  return parts.find((candidate) => candidate.name === name)?.valueDecimal ?? 0;
}

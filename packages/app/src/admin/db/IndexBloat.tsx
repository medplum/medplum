// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Button,
  Group,
  InputWrapper,
  NumberInput,
  Stack,
  Table,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Parameters, ParametersParameter } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { SearchableMultiSelect } from './SearchableMultiSelect';
import { useAvailableTables } from './useAvailableTables';
import { formatBytes } from './utils';

const BYTES_PER_MEGABYTE = 1024 * 1024;

interface IndexBloatInfo {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexType: string;
  indexSize: number;
  estimatedBloatSize?: number;
  bloatPercent?: number;
  liveTuples?: number;
  allocatedPages?: number;
  liveTuplesPerPage?: number;
}

interface InvalidIndexInfo {
  schemaName: string;
  tableName: string;
  indexName: string;
  status: string;
  indexSize: string;
  indexSizeBytes: number;
  indexType: string;
  isPrimary: boolean;
  isUnique: boolean;
}

type SortKey = keyof Pick<
  IndexBloatInfo,
  | 'schemaName'
  | 'tableName'
  | 'indexName'
  | 'indexType'
  | 'indexSize'
  | 'estimatedBloatSize'
  | 'bloatPercent'
  | 'liveTuples'
  | 'allocatedPages'
  | 'liveTuplesPerPage'
>;
type SortDirection = 'asc' | 'desc';

export function IndexHealth(): JSX.Element {
  const medplum = useMedplum();
  const [tableNames, setTableNames] = useState<string[]>([]);
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [minBloatPercent, setMinBloatPercent] = useState<number | string>(30);
  const [minBloatMegabytes, setMinBloatMegabytes] = useState<number | string>(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [indexes, setIndexes] = useState<IndexBloatInfo[] | undefined>();
  const [invalidIndexes, setInvalidIndexes] = useState<InvalidIndexInfo[] | undefined>();
  const [invalidIndexesError, setInvalidIndexesError] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<SortKey>('indexSize');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useAvailableTables({ medplum, onChange: setAvailableTables });

  useEffect(() => {
    let active = true;
    medplum
      .post('fhir/R4/$db-invalid-indexes', {})
      .then((response: Parameters) => {
        if (active) {
          setInvalidIndexes(
            response.parameter
              ?.filter((parameter) => parameter.name === 'invalidIndex' && parameter.valueString)
              .map((parameter) => parseInvalidIndexInfo(parameter.valueString as string)) ?? []
          );
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setInvalidIndexesError(normalizeErrorString(err));
        }
      });
    return () => {
      active = false;
    };
  }, [medplum]);

  const sortedIndexes = useMemo(() => {
    return [...(indexes ?? [])].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];
      if (aValue === undefined) {
        return bValue === undefined ? 0 : 1;
      }
      if (bValue === undefined) {
        return -1;
      }
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
      minIndexSize: String(Math.round(minBloatMegabytes * BYTES_PER_MEGABYTE)),
    });
    if (tableNames.length > 0) {
      query.set('tableName', tableNames.join(','));
    }
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
      const sortsAscending =
        key === 'schemaName' ||
        key === 'tableName' ||
        key === 'indexName' ||
        key === 'indexType' ||
        key === 'liveTuplesPerPage';
      setSortDirection(sortsAscending ? 'asc' : 'desc');
    }
  };

  const inputsValid =
    typeof minBloatPercent === 'number' &&
    minBloatPercent >= 0 &&
    minBloatPercent <= 100 &&
    typeof minBloatMegabytes === 'number' &&
    minBloatMegabytes >= 0;

  const invalidIndexSize = invalidIndexes?.reduce((total, index) => total + index.indexSizeBytes, 0) ?? 0;

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Index health</Title>
        <Text c="dimmed" size="sm">
          Review invalid indexes and analyze valid indexes for bloat. Invalid indexes are excluded from bloat estimates.
        </Text>
      </div>

      <div>
        <Title order={3}>Invalid indexes</Title>
        <Text c="dimmed" size="sm">
          Invalid indexes cannot serve queries, but may still consume disk and add write overhead.
        </Text>
      </div>

      {invalidIndexesError && (
        <Alert color="red" title="Unable to load invalid indexes">
          {invalidIndexesError}
        </Alert>
      )}
      {invalidIndexes === undefined && !invalidIndexesError && <Text c="dimmed">Loading invalid indexes…</Text>}
      {invalidIndexes?.length === 0 && <Text c="dimmed">No invalid indexes detected.</Text>}
      {invalidIndexes && invalidIndexes.length > 0 && (
        <>
          <Alert
            color="yellow"
            title={`${invalidIndexes.length} invalid ${invalidIndexes.length === 1 ? 'index' : 'indexes'} detected`}
          >
            These indexes occupy {formatBytes(invalidIndexSize)} and are not included in the bloat analysis below.
          </Alert>
          <Table.ScrollContainer minWidth={900}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Schema</Table.Th>
                  <Table.Th>Table</Table.Th>
                  <Table.Th>Index</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Size</Table.Th>
                  <Table.Th>Unique</Table.Th>
                  <Table.Th>Primary</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {invalidIndexes.map((index) => (
                  <Table.Tr key={`${index.schemaName}.${index.indexName}`}>
                    <Table.Td>{index.schemaName}</Table.Td>
                    <Table.Td>{index.tableName}</Table.Td>
                    <Table.Td>{index.indexName}</Table.Td>
                    <Table.Td>{index.status}</Table.Td>
                    <Table.Td>{index.indexType.toUpperCase()}</Table.Td>
                    <Table.Td>{index.indexSize}</Table.Td>
                    <Table.Td>{index.isUnique ? 'Yes' : 'No'}</Table.Td>
                    <Table.Td>{index.isPrimary ? 'Yes' : 'No'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}

      <div>
        <Title order={3}>Index bloat</Title>
        <Text c="dimmed" size="sm">
          B-tree rows show an estimated bloat percentage. GIN rows show live tuples per allocated page; a low ratio on a
          large index is a signal to consider REINDEX CONCURRENTLY. Live tuple estimates are updated by VACUUM and
          ANALYZE.
        </Text>
      </div>
      <Group align="end">
        <InputWrapper label="Table(s)">
          <SearchableMultiSelect
            data={availableTables}
            onChange={setTableNames}
            pillInputProps={{ w: 360 }}
            inputProps={{ name: 'tables', placeholder: 'e.g. Observation' }}
          />
        </InputWrapper>
        <NumberInput
          label="Minimum B-tree bloat"
          suffix="%"
          value={minBloatPercent}
          onChange={setMinBloatPercent}
          min={0}
          max={100}
          decimalScale={2}
          w={180}
        />
        <NumberInput
          label="Minimum index size"
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
      {indexes?.length === 0 && !loading && <Text c="dimmed">No indexes meet the selected thresholds.</Text>}
      {indexes && indexes.length > 0 && (
        <Table.ScrollContainer minWidth={1100}>
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
                  label="GIN est. live tuples"
                  sortKey="liveTuples"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={toggleSort}
                />
                <SortableHeader
                  label="GIN allocated pages"
                  sortKey="allocatedPages"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={toggleSort}
                />
                <SortableHeader
                  label="GIN live tuples/page"
                  sortKey="liveTuplesPerPage"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={toggleSort}
                />
                <SortableHeader
                  label="Est. B-tree bloat"
                  sortKey="estimatedBloatSize"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={toggleSort}
                />
                <SortableHeader
                  label="B-tree bloat"
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
                  <Table.Td>{index.liveTuples === undefined ? '—' : index.liveTuples.toLocaleString()}</Table.Td>
                  <Table.Td>
                    {index.allocatedPages === undefined ? '—' : index.allocatedPages.toLocaleString()}
                  </Table.Td>
                  <Table.Td>
                    {index.liveTuplesPerPage === undefined ? '—' : index.liveTuplesPerPage.toFixed(2)}
                  </Table.Td>
                  <Table.Td>
                    {index.estimatedBloatSize === undefined ? '—' : formatBytes(index.estimatedBloatSize)}
                  </Table.Td>
                  <Table.Td>{index.bloatPercent === undefined ? '—' : `${index.bloatPercent.toFixed(2)}%`}</Table.Td>
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
    estimatedBloatSize: getOptionalNumberPart(parts, 'estimatedBloatSize'),
    bloatPercent: getOptionalNumberPart(parts, 'bloatPercent'),
    liveTuples: getOptionalNumberPart(parts, 'liveTuples'),
    allocatedPages: getOptionalNumberPart(parts, 'allocatedPages'),
    liveTuplesPerPage: getOptionalNumberPart(parts, 'liveTuplesPerPage'),
  };
}

function parseInvalidIndexInfo(value: string): InvalidIndexInfo {
  const values = new Map<string, string>();
  for (const line of value.split('\n')) {
    const match = /^\s*\[([^:]+):\s*(.*)]$/.exec(line);
    if (match) {
      values.set(match[1], match[2]);
    }
  }

  const schemaName = values.get('schema') ?? '';
  const qualifiedIndexName = value.split('\n', 1)[0].replace(/:$/, '');
  const indexName = qualifiedIndexName.replace(new RegExp(`^${escapeRegExp(schemaName)}\\.`), '').replace(/^"|"$/g, '');
  const indexSize = values.get('index_size') ?? '0 bytes';
  return {
    schemaName,
    tableName: values.get('table') ?? '',
    indexName,
    status: values.get('index_status') ?? '',
    indexSize,
    indexSizeBytes: parsePostgresSize(indexSize),
    indexType: values.get('index_type') ?? '',
    isPrimary: values.get('is_primary') === 'true',
    isUnique: values.get('is_unique') === 'true',
  };
}

function parsePostgresSize(value: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(bytes|kB|MB|GB|TB)$/.exec(value);
  if (!match) {
    return 0;
  }
  const multipliers: Record<string, number> = {
    bytes: 1,
    kB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };
  return Number(match[1]) * (multipliers[match[2]] ?? 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getStringPart(parts: ParametersParameter[], name: string): string {
  const part = parts.find((candidate) => candidate.name === name);
  return part?.valueString ?? part?.valueCode ?? '';
}

function getNumberPart(parts: ParametersParameter[], name: string): number {
  return parts.find((candidate) => candidate.name === name)?.valueDecimal ?? 0;
}

function getOptionalNumberPart(parts: ParametersParameter[], name: string): number | undefined {
  return parts.find((candidate) => candidate.name === name)?.valueDecimal;
}

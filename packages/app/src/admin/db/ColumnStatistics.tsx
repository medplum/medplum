// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Checkbox, Group, Modal, NumberInput, Stack, Table, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Parameters, ParametersParameter } from '@medplum/fhirtypes';
import { Form, SubmitButton, useMedplum } from '@medplum/react';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { SearchableSelect } from './SearchableSelect';
import { useAvailableTables } from './useAvailableTables';

export function ColumnStatistics(): JSX.Element {
  const medplum = useMedplum();

  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState<ReactNode | undefined>();

  const [table, setTable] = useState<string | undefined>(undefined);
  const [defaultStatsTarget, setDefaultStatsTarget] = useState(0);
  const [loadingStats, setLoadingStats] = useState(false);
  const [columnStats, setColumnStats] = useState<ParametersParameter[]>([]);
  const [selectedRowNames, setSelectedRowNames] = useState<string[]>([]);
  const [resetToDefault, setResetToDefault] = useState(false);
  const [newStatisticsTarget, setNewStatisticsTarget] = useState<number | undefined>(undefined);
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [refreshTable, setRefreshTable] = useState(0);
  const [showMoreStats, setShowMoreStats] = useState(false);
  const [showNonDefaultOnly, setShowNonDefaultOnly] = useState(false);

  useAvailableTables({ medplum, onChange: setAvailableTables });

  useEffect(() => {
    setLoadingStats(true);
    medplum
      .get('fhir/R4/$db-column-statistics?tableName=' + encodeURIComponent(table ?? ''), { cache: 'no-cache' })
      .then((res: Parameters) => {
        const defaultStatsTarget = res.parameter?.find((p) => p.name === 'defaultStatisticsTarget')?.valueInteger ?? 0;
        setDefaultStatsTarget(defaultStatsTarget);

        const tablePart = res.parameter?.find((p) => p.name === 'table')?.part;
        const columns = tablePart?.filter((p) => p.name === 'column');
        setColumnStats(columns ?? []);
      })
      .finally(() => {
        setLoadingStats(false);
      })
      .catch((err) => {
        showNotification({
          color: 'red',
          message: err.message,
        });
      });
  }, [medplum, table, refreshTable]);

  function updateTableStatistics(): void {
    if (!table) {
      return;
    }

    if (selectedRowNames.length === 0) {
      showNotification({
        color: 'red',
        message: 'No columns selected',
        autoClose: true,
      });
      return;
    }

    showNotification({
      title: 'Submit',
      message: JSON.stringify({ resetToDefault, newStatisticsTarget, selectedRowNames }),
      autoClose: true,
    });

    medplum
      .post<Parameters>('fhir/R4/$db-configure-column-statistics', {
        tableName: table,
        columnNames: selectedRowNames,
        resetToDefault,
        newStatisticsTarget: resetToDefault ? undefined : newStatisticsTarget,
      })
      .then((_res) => {
        showNotification({ color: 'green', message: 'Done' });
        setRefreshTable((prev) => prev + 1);
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  const statTdProps = {
    onClick: (value: StatValue) => {
      setModalTitle('Details');
      setModalContent(<pre>{value}</pre>);
      openModal();
    },
  };

  let colsWithDefaultStatsCount = 0;

  return (
    <Form onSubmit={updateTableStatistics}>
      <Stack gap="sm">
        <Group>
          <SearchableSelect
            data={availableTables}
            inputProps={{ placeholder: 'Table name', inputSize: '50' }}
            onChange={(value) => {
              setTable(value);
              setSelectedRowNames([]);
            }}
          />
          <Button loading={loadingStats} onClick={() => setRefreshTable((prev) => prev + 1)}>
            Refresh
          </Button>
        </Group>
        <Group>
          <Text span fw={700}>
            Statistics Target:
          </Text>
          <NumberInput
            value={resetToDefault ? '' : newStatisticsTarget}
            disabled={resetToDefault}
            required={!resetToDefault}
            size="sm"
            w="100"
            min={0}
            step={100}
            max={10000}
            onChange={(value) => {
              if (typeof value === 'number') {
                setNewStatisticsTarget(value);
              }
            }}
          />
          <Text span fw={700} c="dimmed">
            &ndash; or &ndash;
          </Text>
          <Checkbox
            checked={resetToDefault}
            onChange={(event) => setResetToDefault(event.currentTarget.checked)}
            label={'Reset to default (' + defaultStatsTarget + ')'}
            size="sm"
          />
          <SubmitButton size="sm">Update</SubmitButton>
        </Group>
        <Group>
          <Checkbox
            checked={showNonDefaultOnly}
            onChange={(event) => setShowNonDefaultOnly(event.currentTarget.checked)}
            label="Hide columns with default statistics target"
            size="sm"
          />
        </Group>
        <Group>
          <Checkbox
            checked={showMoreStats}
            onChange={(event) => setShowMoreStats(event.currentTarget.checked)}
            label="Show all column stats"
            size="sm"
          />
        </Group>
        <Table.ScrollContainer minWidth={500}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>
                  <Checkbox
                    size="sm"
                    checked={columnStats.length > 0 && selectedRowNames.length === columnStats.length}
                    indeterminate={selectedRowNames.length > 0 && selectedRowNames.length < columnStats.length}
                    onChange={() => {
                      if (selectedRowNames.length === columnStats.length) {
                        setSelectedRowNames([]);
                      } else {
                        setSelectedRowNames(
                          columnStats.map((column) => column.part?.find((p) => p.name === 'name')?.valueString ?? '')
                        );
                      }
                    }}
                  />
                </Table.Th>
                <Table.Th>Column</Table.Th>
                <Table.Th>Statistics Target</Table.Th>
                <Table.Th>null_frac</Table.Th>
                <Table.Th>avg_width</Table.Th>
                <Table.Th>n_distinct</Table.Th>
                <Table.Th>correlation</Table.Th>
                {showMoreStats && (
                  <>
                    <Table.Th>most_common_vals</Table.Th>
                    <Table.Th>most_common_freqs</Table.Th>
                    <Table.Th>histogram_bounds</Table.Th>
                    <Table.Th>most_common_elems</Table.Th>
                    <Table.Th>most_common_elem_freqs</Table.Th>
                    <Table.Th>elem_count_histogram</Table.Th>
                  </>
                )}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {columnStats?.map((column) => {
                const part = column.part ?? [];
                const columnName = part.find((p) => p.name === 'name')?.valueString;
                const statisticsTarget = part.find((p) => p.name === 'statisticsTarget')?.valueInteger;
                if (statisticsTarget === -1) {
                  colsWithDefaultStatsCount++;
                  if (showNonDefaultOnly) {
                    return null;
                  }
                }
                if (!columnName) {
                  throw new Error('Column missing name', { cause: column });
                }
                return (
                  <Table.Tr key={columnName}>
                    <Table.Td>
                      <Checkbox
                        size="sm"
                        checked={selectedRowNames.includes(columnName)}
                        onChange={(event) => {
                          setSelectedRowNames(
                            event.currentTarget.checked
                              ? [...selectedRowNames, columnName]
                              : selectedRowNames.filter((name) => name !== columnName)
                          );
                        }}
                      />
                    </Table.Td>
                    <Table.Td>{columnName}</Table.Td>
                    <Table.Td>
                      {statisticsTarget === -1 ? (
                        <Text span c="dimmed" fs="italic">
                          default ({defaultStatsTarget})
                        </Text>
                      ) : (
                        statisticsTarget
                      )}
                    </Table.Td>
                    <StatTd value={part.find((p) => p.name === 'nullFraction')?.valueDecimal} {...statTdProps} />
                    <StatTd value={part.find((p) => p.name === 'avgWidth')?.valueInteger} {...statTdProps} />
                    <StatTd value={part.find((p) => p.name === 'nDistinct')?.valueDecimal} {...statTdProps} />
                    <StatTd value={part.find((p) => p.name === 'correlation')?.valueDecimal} {...statTdProps} />
                    {showMoreStats && (
                      <>
                        <StatTd value={part.find((p) => p.name === 'mostCommonValues')?.valueString} {...statTdProps} />
                        <StatTd value={part.find((p) => p.name === 'mostCommonFreqs')?.valueString} {...statTdProps} />
                        <StatTd value={part.find((p) => p.name === 'histogramBounds')?.valueString} {...statTdProps} />
                        <StatTd value={part.find((p) => p.name === 'mostCommonElems')?.valueString} {...statTdProps} />
                        <StatTd
                          value={part.find((p) => p.name === 'mostCommonElemFreqs')?.valueString}
                          {...statTdProps}
                        />
                        <StatTd
                          value={part.find((p) => p.name === 'elemCountHistogram')?.valueString}
                          {...statTdProps}
                        />
                      </>
                    )}
                  </Table.Tr>
                );
              })}
              {showNonDefaultOnly && (
                <Table.Tr>
                  <Table.Td colSpan={showMoreStats ? 13 : 7}>
                    <Text c="dimmed" fs="italic">
                      {colsWithDefaultStatsCount} hidden columns with default statistics target
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Stack>
      <Modal opened={modalOpened} onClose={closeModal} title={modalTitle} centered size="auto">
        {modalContent}
      </Modal>
    </Form>
  );
}

type StatValue = string | number | undefined;

interface StatTdProps {
  readonly value: StatValue;
  readonly onClick?: (value: StatValue) => void;
}

function StatTd({ value, onClick }: StatTdProps): JSX.Element {
  return (
    <Table.Td style={{ cursor: 'pointer' }} onClick={() => onClick?.(value)}>
      {formatValue(value)}
    </Table.Td>
  );
}

function formatValue(val: StatValue): StatValue {
  if (typeof val === 'string') {
    return val.length > 30 ? val.substring(0, 30) + '...' : val;
  }

  return val;
}

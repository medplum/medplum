// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Modal, Stack, Table, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { Parameters, ParametersParameter } from '@medplum/fhirtypes';
import { Form, useMedplum } from '@medplum/react';
import { JSX, ReactNode, useEffect, useState } from 'react';
import { SearchableSelect } from './SearchableSelect';
import { getAvailableTables } from './utils';

export function GINIndexes(): JSX.Element {
  const medplum = useMedplum();

  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState<ReactNode | undefined>();

  const [table, setTable] = useState<string | undefined>(undefined);
  const [defaultGinPendingListLimit, setDefaultGinPendingListLimit] = useState(0);
  const [loadingStats, setLoadingStats] = useState(false);
  const [indexes, setIndexes] = useState<ParametersParameter[]>([]);
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [refreshTable, setRefreshTable] = useState(0);

  useEffect(() => {
    async function loadResourceTypes(): Promise<string[]> {
      const valueSet = await medplum.valueSetExpand({
        url: 'https://medplum.com/fhir/ValueSet/resource-types',
        count: 200,
      });
      return valueSet.expansion?.contains?.map((c) => c.code).filter((c) => c !== undefined) ?? [];
    }
    loadResourceTypes()
      .then((resourceTypes) => {
        setAvailableTables(getAvailableTables(resourceTypes));
      })
      .catch(console.error);
  }, [medplum]);

  useEffect(() => {
    setLoadingStats(true);
    medplum
      .get('fhir/R4/$db-indexes?tableName=' + encodeURIComponent(table ?? ''), { cache: 'no-cache' })
      .then((res: Parameters) => {
        const defaultGinPendingListLimit =
          res.parameter?.find((p) => p.name === 'defaultGinPendingListLimit')?.valueInteger ?? 0;
        setDefaultGinPendingListLimit(defaultGinPendingListLimit);

        const indexes = res.parameter?.filter((p) => p.name === 'index');
        setIndexes(indexes ?? []);
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

  const statTdProps = {
    onClick: (value: boolean | string | number | undefined) => {
      setModalTitle('Details');
      setModalContent(<pre>{value}</pre>);
      openModal();
    },
  };

  return (
    <Form onSubmit={() => {}}>
      <Stack gap="sm">
        <Group>
          <Text span fw={700}>
            Default gin_pending_list_limit:
          </Text>
          {defaultGinPendingListLimit}
        </Group>
        <Group>
          <SearchableSelect
            data={availableTables}
            inputProps={{ placeholder: 'Table name', inputSize: '50' }}
            onChange={(value) => {
              setTable(value);
            }}
          />
          <Button loading={loadingStats} onClick={() => setRefreshTable((prev) => prev + 1)}>
            Refresh
          </Button>
        </Group>
        <Table.ScrollContainer minWidth={500}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Schema</Table.Th>
                <Table.Th>Table</Table.Th>
                <Table.Th>Index</Table.Th>
                <Table.Th>fastupdate</Table.Th>
                <Table.Th>gin_pending_list_limit</Table.Th>
                <Table.Th>options</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {indexes?.map((index) => {
                const part = index.part ?? [];
                const indexName = part.find((p) => p.name === 'indexName')?.valueString;
                if (!indexName) {
                  throw new Error('Index missing name', { cause: index });
                }
                return (
                  <Table.Tr key={indexName}>
                    <Table.Td>{part.find((p) => p.name === 'schemaName')?.valueString}</Table.Td>
                    <Table.Td>{part.find((p) => p.name === 'tableName')?.valueString}</Table.Td>
                    <Table.Td>{indexName}</Table.Td>
                    <StatTd
                      value={part.find((p) => p.name === 'fastUpdate')?.valueBoolean}
                      defaultValue={
                        <Text span c="dimmed" fs="italic">
                          default&nbsp;({formatValue(true)})
                        </Text>
                      }
                      {...statTdProps}
                    />
                    <StatTd
                      value={part.find((p) => p.name === 'ginPendingListLimit')?.valueInteger}
                      defaultValue={
                        <Text span c="dimmed" fs="italic">
                          default&nbsp;({defaultGinPendingListLimit})
                        </Text>
                      }
                      {...statTdProps}
                    />
                    <StatTd
                      value={part.find((p) => p.name === 'indexOptions')?.valueString}
                      defaultValue={
                        <Text span c="dimmed" fs="italic">
                          NULL
                        </Text>
                      }
                      {...statTdProps}
                    />
                  </Table.Tr>
                );
              })}
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

type StatValue = boolean | string | number | undefined;
interface StatTdProps {
  readonly value: StatValue;
  readonly onClick?: (value: StatValue) => void;
  readonly defaultValue?: React.ReactNode;
}

function StatTd({ value, onClick, defaultValue }: StatTdProps): JSX.Element {
  return (
    <Table.Td style={{ cursor: 'pointer' }} onClick={() => onClick?.(value)}>
      {value === undefined ? defaultValue : formatValue(value)}
    </Table.Td>
  );
}

function formatValue(val: StatValue): string | number | undefined {
  if (typeof val === 'string') {
    return val.length > 50 ? val.substring(0, 50) + '...' : val;
  } else if (typeof val === 'boolean') {
    // boolean false values aren't rendered by React, so just stringify them
    return val.toString().toLocaleUpperCase();
  }

  return val;
}

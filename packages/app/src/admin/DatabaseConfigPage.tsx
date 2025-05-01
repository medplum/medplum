import {
  Button,
  Checkbox,
  Combobox,
  Group,
  InputBase,
  InputBaseProps,
  Modal,
  NumberInput,
  PolymorphicComponentProps,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
  useCombobox,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { forbidden } from '@medplum/core';
import { Parameters, ParametersParameter } from '@medplum/fhirtypes';
import { Container, Form, OperationOutcomeAlert, Panel, SubmitButton, useMedplum } from '@medplum/react';
import { ReactNode, useEffect, useState } from 'react';

export function DatabaseConfigPage(): JSX.Element {
  const medplum = useMedplum();
  const tabs = ['Column Statistics'];
  const [currentTab, setCurrentTab] = useState(tabs[0]);

  function onTabChange(newTabName: string | null): void {
    if (!newTabName) {
      newTabName = tabs[0];
    }
    setCurrentTab(newTabName);
  }

  if (!medplum.isLoading() && !medplum.isSuperAdmin()) {
    return <OperationOutcomeAlert outcome={forbidden} />;
  }

  return (
    <Container maw="100%">
      <Panel>
        <Title order={1}>Database Configuration</Title>
        <Tabs value={currentTab} onChange={onTabChange}>
          <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
            {tabs.map((t) => (
              <Tabs.Tab key={t} value={t}>
                {t}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="Column Statistics" pt="md">
            <ColumnStatistics />
          </Tabs.Panel>
        </Tabs>
      </Panel>
    </Container>
  );
}

function ColumnStatistics(): JSX.Element {
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
  const [showMoreStats, setShowMoreStats] = useState(true);

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
      .get('fhir/R4/$db-column-statistics?tableName=' + (table ?? ''), { cache: 'no-cache' })
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
      .post('fhir/R4/$db-column-statistics', {
        tableName: table,
        columnNames: selectedRowNames,
        resetToDefault,
        newStatisticsTarget: resetToDefault ? undefined : newStatisticsTarget,
      })
      .then((res: Parameters) => {
        const ok = res.parameter?.find((p) => p.name === 'ok')?.valueBoolean;
        if (ok) {
          showNotification({ color: 'green', message: 'Done' });
        } else {
          showNotification({ color: 'red', message: 'Failed' });
        }
        setRefreshTable((prev) => prev + 1);
      })
      .catch(console.error);
  }

  const statTdProps = {
    onClick: (value: string | number | undefined) => {
      setModalTitle('Details');
      setModalContent(<pre>{value}</pre>);
      openModal();
    },
  };

  return (
    <Form onSubmit={updateTableStatistics}>
      <Stack gap="sm">
        <Group>
          <Text span fw={700}>
            Default Statistics Target:
          </Text>
          {defaultStatsTarget}
        </Group>
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
            label="Reset to default"
            size="sm"
          />
          <SubmitButton size="sm">Update</SubmitButton>
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
                          default
                        </Text>
                      ) : (
                        statisticsTarget
                      )}
                    </Table.Td>
                    <StatTd value={part.find((p) => p.name === 'nullFraction')?.valueDecimal} {...statTdProps} />
                    <StatTd value={part.find((p) => p.name === 'avgWidth')?.valueInteger} {...statTdProps} />
                    <StatTd value={part.find((p) => p.name === 'nDistinct')?.valueInteger} {...statTdProps} />
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

function getAvailableTables(resourceTypes: string[]): string[] {
  const tables: string[] = [];
  for (const resourceType of resourceTypes) {
    tables.push(resourceType);
    tables.push(resourceType + '_History');
    tables.push(resourceType + '_Token');
    tables.push(resourceType + '_References');
  }
  tables.push('Address');
  tables.push('ContactPoint');
  tables.push('HumanName');
  tables.push('Coding');
  tables.push('Coding_Property');
  tables.push('DatabaseMigration');
  tables.sort();
  return tables;
}

export function SearchableSelect({
  inputProps,
  data,
  onChange,
}: {
  inputProps?: PolymorphicComponentProps<'input', InputBaseProps>;
  data: string[];
  onChange?: (value: string) => void;
}): JSX.Element {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const [value, setValue] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filteredOptions = data.filter((item) => item.toLowerCase().includes(search.toLowerCase().trim()));

  const options = filteredOptions.map((item) => (
    <Combobox.Option value={item} key={item}>
      {item}
    </Combobox.Option>
  ));

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(val) => {
        if (onChange) {
          onChange(val);
        }
        setValue(val);
        setSearch(val);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          rightSection={<Combobox.Chevron />}
          value={search}
          onChange={(event) => {
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
            setSearch(event.currentTarget.value);
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => {
            combobox.closeDropdown();
            setSearch(value || '');
          }}
          rightSectionPointerEvents="none"
          {...inputProps}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {options.length > 0 ? options : <Combobox.Empty>Nothing found</Combobox.Empty>}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

function StatTd({
  value,
  onClick,
}: {
  value: string | number | undefined;
  onClick?: (value: string | number | undefined) => void;
}): JSX.Element {
  return (
    <Table.Td style={{ cursor: 'pointer' }} onClick={() => onClick?.(value)}>
      {formatValue(value)}
    </Table.Td>
  );
}

function formatValue(val: string | number | undefined): string | number | undefined {
  if (typeof val === 'string') {
    return val.length > 30 ? val.substring(0, 30) + '...' : val;
  }

  return val;
}

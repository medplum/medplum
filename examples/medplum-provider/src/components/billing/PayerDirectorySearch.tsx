// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Card, Checkbox, CloseButton, Group, Pagination, Stack, Table, Text, TextInput } from '@mantine/core';
import type { Organization } from '@medplum/fhirtypes';
import { IconCheck, IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { CandidPayerDirectory } from '../../hooks/useCandidPayerDirectory';
import { formatPayerCategory, getPayerCategory, getPayerId, getPayerUuid } from '../../utils/billing';

export interface PayerDirectorySearchProps {
  readonly directory: CandidPayerDirectory;
  /** Called when a search result row is tapped to view details. */
  readonly onSelectPayer: (payer: Organization) => void;
}

export function PayerDirectorySearch(props: PayerDirectorySearchProps): JSX.Element {
  const { directory, onSelectPayer } = props;
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleSearch = async (): Promise<void> => {
    await directory.search(searchTerm);
    setSelected(new Set());
  };

  const handleClear = (): void => {
    setSearchTerm('');
    setSelected(new Set());
    directory.clearSearch();
  };

  const toggleSelected = (payerUuid: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(payerUuid)) {
        next.delete(payerUuid);
      } else {
        next.add(payerUuid);
      }
      return next;
    });
  };

  const handleImport = async (): Promise<void> => {
    await directory.importPayers(selected);
    setSelected(new Set());
  };

  return (
    <Card withBorder p="md">
      <Stack gap="sm">
        <Group align="flex-end" gap="sm">
          <TextInput
            label="Search the payer directory"
            placeholder="Payer name or payer ID, e.g. AETNA"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleSearch().catch(console.error);
              }
            }}
            rightSection={
              (searchTerm || directory.searchResults !== undefined) && (
                <CloseButton aria-label="Clear search" onClick={handleClear} />
              )
            }
            style={{ flex: 1 }}
          />
          <Button
            leftSection={<IconSearch size={16} />}
            onClick={() => handleSearch().catch(console.error)}
            loading={directory.searching}
          >
            Search
          </Button>
        </Group>

        {directory.searchResults?.length === 0 && (
          <Text c="dimmed" size="sm">
            No payers found. Try a different name or payer ID.
          </Text>
        )}

        {!!directory.searchResults?.length && (
          <Stack gap="xs">
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={40} />
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Payer ID</Table.Th>
                  <Table.Th>Category</Table.Th>
                  <Table.Th w={110}>Imported</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {directory.searchResults.map((payer) => {
                  const payerUuid = getPayerUuid(payer) ?? '';
                  const imported = directory.importedUuids.has(payerUuid);
                  const category = getPayerCategory(payer);
                  return (
                    <Table.Tr key={payerUuid} onClick={() => onSelectPayer(payer)} style={{ cursor: 'pointer' }}>
                      <Table.Td onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          aria-label={`Select ${payer.name}`}
                          checked={imported || selected.has(payerUuid)}
                          disabled={imported}
                          onChange={() => toggleSelected(payerUuid)}
                        />
                      </Table.Td>
                      <Table.Td>{payer.name}</Table.Td>
                      <Table.Td>{getPayerId(payer)}</Table.Td>
                      <Table.Td>{category && formatPayerCategory(category)}</Table.Td>
                      <Table.Td>
                        {imported && <IconCheck size={16} color="var(--mantine-color-green-6)" aria-label="Imported" />}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
            <Group justify="space-between">
              <Button
                onClick={() => handleImport().catch(console.error)}
                disabled={selected.size === 0}
                loading={directory.importing}
              >
                Import selected ({selected.size})
              </Button>
              <Pagination
                value={directory.page}
                total={directory.pageCount}
                onChange={(pageNumber) => directory.setPage(pageNumber).catch(console.error)}
                disabled={directory.searching || directory.fetchingPage}
              />
            </Group>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

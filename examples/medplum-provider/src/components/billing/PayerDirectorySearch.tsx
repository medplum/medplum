// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Card, Checkbox, CloseButton, Group, Pagination, Stack, Table, Text, TextInput } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import type { Organization, Parameters } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCheck, IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { CandidPayerPage } from '../../utils/billing';
import { formatPayerCategory, getPayerCategory, getPayerId, getPayerUuid, parsePayerSearchPage } from '../../utils/billing';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';

const SEARCH_PAGE_SIZE = 20;

export interface PayerDirectorySearchProps {
  /** ID of the deployed candid-get-payers bot. */
  readonly botId: string;
  /** Candid payer UUIDs already imported, to mark results and block re-import. */
  readonly importedUuids: Set<string>;
  /** Called after an import attempt persists at least one payer. */
  readonly onImported: () => void;
  /** Called when a search result row is tapped to view details. */
  readonly onSelectPayer: (payer: Organization) => void;
}

export function PayerDirectorySearch(props: PayerDirectorySearchProps): JSX.Element {
  const { botId, importedUuids, onImported, onSelectPayer } = props;
  const medplum = useMedplum();
  const [searchTerm, setSearchTerm] = useState('');
  // Candid pages by opaque token, so pages are cached as they are fetched and Previous/Next
  // navigate the cache; only a step past the last cached page fetches.
  const [pages, setPages] = useState<Organization[][] | undefined>(undefined);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);

  const fetchPage = async (pageToken?: string): Promise<CandidPayerPage> => {
    const result = (await medplum.executeBot(
      botId,
      { searchTerm: searchTerm.trim(), limit: SEARCH_PAGE_SIZE, ...(pageToken && { pageToken }) },
      'application/json'
    )) as Parameters;
    return parsePayerSearchPage(result);
  };

  const handleSearch = async (): Promise<void> => {
    setSearching(true);
    try {
      const page = await fetchPage();
      setPages([page.items ?? []]);
      setPageIndex(0);
      setNextPageToken(page.nextPageToken);
      setSelected(new Set());
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setSearching(false);
    }
  };

  // Candid pagination is token-based, so the pagination control only ever exposes one page
  // beyond the cache; stepping onto it fetches with the stored token.
  const handlePageChange = async (pageNumber: number): Promise<void> => {
    const index = pageNumber - 1;
    if (pages && index < pages.length) {
      setPageIndex(index);
      return;
    }
    if (!nextPageToken) {
      return;
    }
    setSearching(true);
    try {
      const page = await fetchPage(nextPageToken);
      setPages((prev) => [...(prev ?? []), page.items ?? []]);
      setPageIndex((i) => i + 1);
      setNextPageToken(page.nextPageToken);
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setSearching(false);
    }
  };

  const handleClear = (): void => {
    setSearchTerm('');
    setPages(undefined);
    setPageIndex(0);
    setNextPageToken(undefined);
    setSelected(new Set());
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
    // The bot returns ready-to-persist Organizations, so import is a plain create.
    const toImport = (pages ?? []).flat().filter((payer) => selected.has(getPayerUuid(payer) ?? ''));
    if (toImport.length === 0) {
      return;
    }
    setImporting(true);
    const failures: string[] = [];
    for (const payer of toImport) {
      try {
        await medplum.createResource(payer);
      } catch (error) {
        failures.push(`${payer.name}: ${normalizeErrorString(error)}`);
      }
    }
    setImporting(false);
    setSelected(new Set());
    onImported();
    const importedCount = toImport.length - failures.length;
    if (importedCount > 0) {
      showSuccessNotification({
        title: 'Success',
        message: `Imported ${importedCount} payer${importedCount === 1 ? '' : 's'}`,
      });
    }
    if (failures.length > 0) {
      showErrorNotification(new Error(`Failed to import ${failures.length} payer(s). ${failures.join('; ')}`));
    }
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
              (searchTerm || pages !== undefined) && <CloseButton aria-label="Clear search" onClick={handleClear} />
            }
            style={{ flex: 1 }}
          />
          <Button
            leftSection={<IconSearch size={16} />}
            onClick={() => handleSearch().catch(console.error)}
            loading={searching && pages === undefined}
          >
            Search
          </Button>
        </Group>

        {pages?.[0]?.length === 0 && (
          <Text c="dimmed" size="sm">
            No payers found. Try a different name or payer ID.
          </Text>
        )}

        {!!pages?.[0]?.length && (
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
                {(pages[pageIndex] ?? []).map((payer) => {
                  const payerUuid = getPayerUuid(payer) ?? '';
                  const imported = importedUuids.has(payerUuid);
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
                loading={importing}
              >
                Import selected ({selected.size})
              </Button>
              <Pagination
                value={pageIndex + 1}
                total={pages.length + (nextPageToken ? 1 : 0)}
                onChange={(pageNumber) => handlePageChange(pageNumber).catch(console.error)}
                disabled={searching}
              />
            </Group>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

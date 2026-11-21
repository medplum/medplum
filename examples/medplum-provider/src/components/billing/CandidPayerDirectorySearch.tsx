// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Button,
  Checkbox,
  CloseButton,
  Divider,
  Group,
  Pagination,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { getIdentifier } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { IconCheck, IconInfoCircle, IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { CandidPayerDirectory } from '../../hooks/useCandidPayerDirectory';
import { formatPayerCategory, getPayerCategory } from '../../utils/billing';
import { CANDID_PAYER_UUID_SYSTEM, CHC_PAYER_ID_SYSTEM, CMS_PAYER_ID_SYSTEM } from '../../utils/candid';

/**
 * Props for the payer directory search. The caller owns the selection, the UUIDs of the payers checked for
 * import, so it can import them from outside the search; a new search or a cleared one empties it.
 */
export interface CandidPayerDirectorySearchProps {
  readonly directory: CandidPayerDirectory;
  readonly selected: ReadonlySet<string>;
  readonly onSelectedChange: (selected: Set<string>) => void;
  readonly onSelectPayer: (payer: Organization) => void;
}

export function CandidPayerDirectorySearch(props: CandidPayerDirectorySearchProps): JSX.Element | null {
  const { directory, selected, onSelectedChange, onSelectPayer } = props;
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearch = async (): Promise<void> => {
    await directory.search(searchTerm);
    onSelectedChange(new Set());
  };

  const handleClear = (): void => {
    setSearchTerm('');
    onSelectedChange(new Set());
    directory.clearSearch();
  };

  const toggleSelected = (payerUuid: string): void => {
    const next = new Set(selected);
    if (next.has(payerUuid)) {
      next.delete(payerUuid);
    } else {
      next.add(payerUuid);
    }
    onSelectedChange(next);
  };

  if (directory.botId === '') {
    return (
      <Alert icon={<IconInfoCircle size={16} />} color="yellow" variant="light">
        The Candid payer directory bot is not deployed in this project, so payers cannot be searched or imported here.
      </Alert>
    );
  }
  if (!directory.botId) {
    // Bot lookup still pending
    return null;
  }

  return (
    <Stack gap="sm">
      <TextInput
        label="Search the Payer Directory"
        data-autofocus
        leftSection={<IconSearch size={16} />}
        placeholder="Payer name or payer ID, e.g. AETNA"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !directory.searching) {
            handleSearch().catch(console.error);
          }
        }}
        rightSection={
          (searchTerm || directory.searchResults !== undefined) && (
            <CloseButton aria-label="Clear search" onClick={handleClear} />
          )
        }
      />
      <Button
        fullWidth
        variant="default"
        onClick={() => handleSearch().catch(console.error)}
        loading={directory.searching}
      >
        Search
      </Button>
      {directory.truncated && (
        <Text c="dimmed" size="sm" ta="center">
          Showing the first 100 matches. Refine your search to narrow them down.
        </Text>
      )}

      {directory.searchResults !== undefined && <Divider my="sm" />}

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
              {directory.searchResults.map((payer, index) => {
                // The UUID is how a payer is selected and imported, so an entry without one
                // cannot be imported; index keeps such rows from colliding on a shared key.
                const payerUuid = getIdentifier(payer, CANDID_PAYER_UUID_SYSTEM);
                const imported = !!payerUuid && directory.importedUuids.has(payerUuid);
                const category = getPayerCategory(payer);
                return (
                  <Table.Tr
                    key={payerUuid ?? `row-${index}`}
                    onClick={() => onSelectPayer(payer)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Table.Td onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        aria-label={`Select ${payer.name}`}
                        checked={imported || (!!payerUuid && selected.has(payerUuid))}
                        disabled={imported || !payerUuid}
                        onChange={() => payerUuid && toggleSelected(payerUuid)}
                      />
                    </Table.Td>
                    <Table.Td>{payer.name}</Table.Td>
                    <Table.Td>
                      {getIdentifier(payer, CHC_PAYER_ID_SYSTEM) ?? getIdentifier(payer, CMS_PAYER_ID_SYSTEM)}
                    </Table.Td>
                    <Table.Td>{category && formatPayerCategory(category)}</Table.Td>
                    <Table.Td>
                      {imported && <IconCheck size={16} color="var(--mantine-color-green-6)" aria-label="Imported" />}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
          <Group justify="center">
            <Pagination
              value={directory.page}
              total={directory.pageCount}
              onChange={directory.setPage}
              disabled={directory.searching}
            />
          </Group>
        </Stack>
      )}
    </Stack>
  );
}

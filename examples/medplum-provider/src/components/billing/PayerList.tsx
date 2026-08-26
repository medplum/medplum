// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  CloseButton,
  Group,
  Pagination,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import type { WithId } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { Organization, Parameters } from '@medplum/fhirtypes';
import { Modal, useMedplum } from '@medplum/react';
import { IconCheck, IconInfoCircle, IconRefresh, IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { CandidPayerPage } from '../../utils/billing';
import {
  CANDID_ELIGIBILITY_SUPPORT_EXTENSION,
  CANDID_PAYER_UUID_SYSTEM,
  CANDID_PROFESSIONAL_CLAIMS_SUPPORT_EXTENSION,
  CANDID_REMITTANCE_SUPPORT_EXTENSION,
  buildPayerRefreshOps,
  formatPayerCategory,
  getPayerCategory,
  getPayerId,
  getPayerUuid,
  isPayerNotFoundError,
  parsePayerSearchPage,
} from '../../utils/billing';
import { CANDID_GET_PAYERS_BOT_IDENTIFIER } from '../../utils/candid';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';

const SEARCH_PAGE_SIZE = 20;

const SUPPORT_STATE_LABELS: Record<string, { label: string; color: string }> = {
  SUPPORTED_ENROLLMENT_NOT_REQUIRED: { label: 'Supported', color: 'green' },
  SUPPORTED_ENROLLMENT_REQUIRED: { label: 'Enrollment required', color: 'yellow' },
  NOT_SUPPORTED: { label: 'Not supported', color: 'gray' },
};

const PAYER_SUPPORT_CAPABILITIES: { url: string; label: string }[] = [
  { url: CANDID_ELIGIBILITY_SUPPORT_EXTENSION, label: 'Eligibility' },
  { url: CANDID_PROFESSIONAL_CLAIMS_SUPPORT_EXTENSION, label: 'Professional claims' },
  { url: CANDID_REMITTANCE_SUPPORT_EXTENSION, label: 'Remittance' },
];

export function PayerList(): JSX.Element {
  const medplum = useMedplum();
  const [importedPayers, setImportedPayers] = useState<WithId<Organization>[]>([]);
  const [reload, setReload] = useState(0);
  // undefined = lookup pending, '' = bot not deployed
  const [botId, setBotId] = useState<string | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  // Candid pages by opaque token, so pages are cached as they are fetched and Previous/Next
  // navigate the cache; only a step past the last cached page fetches.
  const [pages, setPages] = useState<Organization[][] | undefined>(undefined);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // A search result (not yet persisted, no id) or an imported payer (with id, refreshable).
  const [detailsPayer, setDetailsPayer] = useState<Organization | undefined>(undefined);

  useEffect(() => {
    // Imported payers are recognized by the Candid payer UUID identifier stamped on import.
    medplum
      .searchResources('Organization', {
        identifier: `${CANDID_PAYER_UUID_SYSTEM}|`,
        _count: '100',
        _sort: 'name',
      })
      .then(setImportedPayers)
      .catch(showErrorNotification);
  }, [medplum, reload]);

  useEffect(() => {
    medplum
      .searchOne('Bot', {
        identifier: `${CANDID_GET_PAYERS_BOT_IDENTIFIER.system}|${CANDID_GET_PAYERS_BOT_IDENTIFIER.value}`,
      })
      .then((bot) => setBotId(bot?.id ?? ''))
      .catch(showErrorNotification);
  }, [medplum]);

  const importedUuids = useMemo(
    () => new Set(importedPayers.map(getPayerUuid).filter(Boolean) as string[]),
    [importedPayers]
  );

  const fetchPage = async (pageToken?: string): Promise<CandidPayerPage> => {
    const result = (await medplum.executeBot(
      botId as string,
      { searchTerm: searchTerm.trim(), limit: SEARCH_PAGE_SIZE, ...(pageToken && { pageToken }) },
      'application/json'
    )) as Parameters;
    return parsePayerSearchPage(result);
  };

  const handleSearch = async (): Promise<void> => {
    if (!botId) {
      return;
    }
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
    if (!botId || !nextPageToken) {
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

  const handleRefresh = async (org: WithId<Organization>): Promise<void> => {
    const payerUuid = getPayerUuid(org);
    if (!botId || !payerUuid) {
      return;
    }
    setRefreshing(true);
    try {
      const fresh = (await medplum.executeBot(botId, { payerUuid }, 'application/json')) as Organization;
      const ops = buildPayerRefreshOps(org, fresh);
      if (ops.length === 0) {
        showSuccessNotification({ title: 'Refresh complete', message: 'Payer is up to date with the directory' });
        return;
      }
      const updated = await medplum.patchResource('Organization', org.id, ops);
      setDetailsPayer(updated);
      setReload((r) => r + 1);
      showSuccessNotification({ title: 'Refresh complete', message: 'Payer updated from the directory' });
    } catch (error) {
      if (!isPayerNotFoundError(error)) {
        showErrorNotification(error);
      } else if (org.active === false) {
        showErrorNotification(new Error('This payer is still not in the Candid payer directory.'));
      } else {
        try {
          // Deactivate rather than delete: claims and coverages may reference the payer.
          const updated = await medplum.patchResource('Organization', org.id, [
            { op: 'add', path: '/active', value: false },
          ]);
          setDetailsPayer(updated);
          setReload((r) => r + 1);
          showErrorNotification(
            new Error('This payer is no longer in the Candid payer directory and has been marked inactive.')
          );
        } catch (patchError) {
          showErrorNotification(patchError);
        }
      }
    } finally {
      setRefreshing(false);
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
    setReload((r) => r + 1);
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
    <Stack gap="sm">
      {botId === '' && (
        <Alert icon={<IconInfoCircle size={16} />} color="yellow" variant="light">
          The Candid payer directory bot is not deployed in this project, so payers cannot be searched or imported here.
        </Alert>
      )}

      {!!botId && (
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
                        <Table.Tr key={payerUuid} onClick={() => setDetailsPayer(payer)} style={{ cursor: 'pointer' }}>
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
                            {imported && (
                              <IconCheck size={16} color="var(--mantine-color-green-6)" aria-label="Imported" />
                            )}
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
      )}

      <Text fw={600} size="lg" mt="xs">
        Imported payers
      </Text>
      {importedPayers.length === 0 ? (
        <Card withBorder p="md">
          <Text c="dimmed" size="sm">
            No payers imported yet. Search the payer directory to import the payers you bill.
          </Text>
        </Card>
      ) : (
        importedPayers.map((payer) => <PayerCard key={payer.id} payer={payer} onClick={() => setDetailsPayer(payer)} />)
      )}

      <Modal
        opened={detailsPayer !== undefined}
        onClose={() => setDetailsPayer(undefined)}
        title={detailsPayer?.name}
        size="lg"
        actions={
          // Only an imported (persisted) payer can be refreshed
          detailsPayer?.id !== undefined &&
          !!botId && (
            <Group justify="flex-start" style={{ width: '100%' }}>
              <Button
                variant="outline"
                leftSection={<IconRefresh size={16} />}
                onClick={() => handleRefresh(detailsPayer as WithId<Organization>).catch(console.error)}
                loading={refreshing}
              >
                Refresh from directory
              </Button>
            </Group>
          )
        }
      >
        {detailsPayer && <PayerDetails payer={detailsPayer} />}
      </Modal>
    </Stack>
  );
}

function PayerDetails(props: { payer: Organization }): JSX.Element {
  const { payer } = props;
  const category = getPayerCategory(payer);
  const address = payer.address?.[0];
  const addressText =
    address &&
    [address.line?.join(', '), address.city, [address.state, address.postalCode].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', ');
  const supportBadges = PAYER_SUPPORT_CAPABILITIES.map(({ url, label }) => ({
    label,
    state: SUPPORT_STATE_LABELS[payer.extension?.find((e) => e.url === url)?.valueCode ?? ''],
  })).filter((entry) => entry.state);

  return (
    <Stack gap="md">
      <Stack gap="sm">
        <div>
          <Text size="xs" c="dimmed">
            Payer ID
          </Text>
          <Text>{getPayerId(payer) ?? '—'}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">
            Category
          </Text>
          <Text>{category ? formatPayerCategory(category) : '—'}</Text>
        </div>
        {addressText && (
          <div>
            <Text size="xs" c="dimmed">
              Address
            </Text>
            <Text>{addressText}</Text>
          </div>
        )}
      </Stack>
      {supportBadges.length > 0 && (
        <div>
          <Text size="xs" c="dimmed" mb={4}>
            Clearinghouse support
          </Text>
          <Group gap="sm">
            {supportBadges.map(({ label, state }) => (
              <Badge key={label} color={state.color} variant="light">
                {label}: {state.label}
              </Badge>
            ))}
          </Group>
        </div>
      )}
      {!!payer.alias?.length && (
        <div>
          <Text size="xs" c="dimmed" mb={4}>
            Also known as
          </Text>
          <Text size="sm">{payer.alias.join(' · ')}</Text>
        </div>
      )}
    </Stack>
  );
}

function PayerCard(props: { payer: WithId<Organization>; onClick: () => void }): JSX.Element {
  const { payer, onClick } = props;
  const payerId = getPayerId(payer);
  const category = getPayerCategory(payer);
  return (
    <Card
      withBorder
      p="md"
      component="button"
      type="button"
      onClick={onClick}
      style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }}
      aria-label={`View ${payer.name ?? payer.id}`}
    >
      <Group justify="space-between">
        <Group gap="sm">
          <Text fw={600}>{payer.name ?? payer.id}</Text>
          {category && (
            <Badge color="blue" variant="light">
              {formatPayerCategory(category)}
            </Badge>
          )}
          {payer.active === false && (
            <Badge color="gray" variant="light">
              Inactive — not in payer directory
            </Badge>
          )}
        </Group>
        {payerId && (
          <Text size="sm" c="dimmed">
            Payer ID {payerId}
          </Text>
        )}
      </Group>
    </Card>
  );
}

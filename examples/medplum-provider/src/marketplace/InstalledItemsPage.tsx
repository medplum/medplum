// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  Anchor,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPackage, IconPlus, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { getListingById, listingIconColor, listingIconComponent, typeBadgeColor, typeBrowseLabels, typeDisplayNames, typeIconComponent } from './data';
import { useMarketplace } from './useMarketplace';
import { useMarketplaceBreadcrumbs } from './useMarketplaceBreadcrumbs';
import type { ListingType, MarketplaceListing } from './types';

// ─── Tab configuration ──────────────────────────────────────────────────────

const typeTabs: { value: string; label: string; canAddNew: boolean }[] = [
  { value: 'all', label: 'All', canAddNew: false },
  { value: 'App', label: 'Apps', canAddNew: true },
  { value: 'Automation', label: 'Automations', canAddNew: true },
  { value: 'Spaces Skill', label: 'Spaces Skills', canAddNew: true },
  { value: 'Template', label: 'Template', canAddNew: false },
  { value: 'Content Pack', label: 'Data & Content', canAddNew: false },
];

function getInstalledEmptyMessage(canAddNew: boolean): string {
  return canAddNew
    ? 'You can add a new one using the button above, or browse the marketplace.'
    : 'Browse the marketplace to find and install items.';
}

// ─── Installed Items Page ───────────────────────────────────────────────────

export function InstalledItemsPage(): JSX.Element {
  const { installedItems, customListings, uninstall, addCustomListing, updateCustomListing } = useMarketplace();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [addModalOpened, { open: openAddModal, close: closeAddModal }] = useDisclosure(false);
  const [detailModalOpened, { open: openDetailModal, close: closeDetailModal }] = useDisclosure(false);
  const [viewingListing, setViewingListing] = useState<MarketplaceListing | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const items = Object.values(installedItems);

  // Resolve all installed listings (from catalog + custom)
  const allInstalledListings = useMemo(() => {
    return items
      .map((item) => {
        const catalogListing = getListingById(item.listingId);
        if (catalogListing) {
          return { item, listing: catalogListing };
        }
        const customListing = customListings.find((l) => l.id === item.listingId);
        if (customListing) {
          return { item, listing: customListing };
        }
        return null;
      })
      .filter(Boolean) as { item: (typeof items)[0]; listing: MarketplaceListing }[];
  }, [items, customListings]);

  // Filter by active tab
  const filteredListings = useMemo(() => {
    if (activeTab === 'all') {
      return allInstalledListings;
    }
    return allInstalledListings.filter((entry) => entry.listing.type === activeTab);
  }, [allInstalledListings, activeTab]);

  // Current tab config
  const currentTab = typeTabs.find((t) => t.value === activeTab);
  const canAddNew = currentTab?.canAddNew ?? false;

  const handleAddNew = (): void => {
    if (!newName.trim()) {
      return;
    }
    addCustomListing(newName.trim(), activeTab as ListingType, newDescription.trim() || undefined);
    setNewName('');
    setNewDescription('');
    closeAddModal();
  };

  const { setBreadcrumbs } = useMarketplaceBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: 'Manage Installed' }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  return (
    <Box py="xl" style={{ paddingInline: 'calc(var(--mantine-spacing-xl) * 3)' }}>
      {/* Pill Tabs */}
      <Tabs
        value={activeTab}
        onChange={(v) => setActiveTab(v ?? 'all')}
        variant="unstyled"
        className="pill-tabs"
        mb="xl"
      >
        <Group justify="space-between" align="flex-end">
          <Tabs.List>
            {typeTabs.map((tab) => (
              <Tabs.Tab key={tab.value} value={tab.value}>
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Button
            size="sm"
            leftSection={<IconPlus size={16} />}
            onClick={openAddModal}
            style={{ visibility: canAddNew ? 'visible' : 'hidden' }}
          >
            Add New {typeBrowseLabels[activeTab] ? typeDisplayNames[activeTab] : ''}
          </Button>
        </Group>
      </Tabs>

      {/* Content */}
      {filteredListings.length === 0 ? (
        <Center py="xl">
          <Stack align="center" gap="md">
            <ThemeIcon size={64} radius="xl" variant="light" color="gray">
              <IconPackage size={32} />
            </ThemeIcon>
            <Text fw={500}>
              {activeTab === 'all' ? 'Nothing installed yet' : `No ${currentTab?.label ?? 'items'} installed`}
            </Text>
            <Text size="sm" c="dimmed" ta="center" maw={400}>
              {activeTab === 'all'
                ? 'Browse the marketplace to discover apps, templates, bots, and more to extend your Medplum environment.'
                : getInstalledEmptyMessage(canAddNew)}
            </Text>
            <Button
              component={Link}
              to={
                activeTab === 'all'
                  ? '/marketplace'
                  : `/marketplace/browse?${new URLSearchParams({ type: activeTab }).toString()}`
              }
              variant="light"
            >
              {activeTab === 'all' ? 'Browse Marketplace' : `Browse ${currentTab?.label ?? 'Marketplace'}`}
            </Button>
          </Stack>
        </Center>
      ) : (
        <Paper shadow="xs" radius="md" withBorder>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Vendor</Table.Th>
                <Table.Th>Installed</Table.Th>
                <Table.Th style={{ width: 100 }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredListings.map(({ item, listing }) => {
                const TypeIcon = listingIconComponent[listing.id] ?? typeIconComponent[listing.type] ?? typeIconComponent['App'];
                const iconColor = listingIconColor[listing.id];
                let iconElement: JSX.Element;
                if (listing.icon) {
                  iconElement = (
                    <Box
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        border: '1px solid var(--mantine-color-gray-3)',
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      <img src={listing.icon} alt={listing.name} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: 2 }} />
                    </Box>
                  );
                } else if (iconColor) {
                  iconElement = (
                    <Box
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        border: '1px solid var(--mantine-color-gray-3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <TypeIcon size={12} color={iconColor} />
                    </Box>
                  );
                } else {
                  iconElement = (
                    <ThemeIcon size="sm" radius="sm" variant="light" color={typeBadgeColor[listing.type] ?? 'gray'}>
                      <TypeIcon size={12} />
                    </ThemeIcon>
                  );
                }
                return (
                  <Table.Tr key={item.listingId}>
                    <Table.Td>
                      <Group gap="xs">
                        {iconElement}
                        {listing.id.startsWith('custom-') ? (
                          <Anchor
                            size="sm"
                            fw={500}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setViewingListing(listing);
                              setEditName(listing.name);
                              setEditDescription(listing.tagline);
                              openDetailModal();
                            }}
                          >
                            {listing.name}
                          </Anchor>
                        ) : (
                          <Anchor component={Link} to={`/marketplace/${listing.id}`} size="sm" fw={500}>
                            {listing.name}
                          </Anchor>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="light" color={typeBadgeColor[listing.type] ?? 'gray'}>
                        {typeDisplayNames[listing.type] ?? listing.type}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {listing.vendor.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {new Date(item.installedAt).toLocaleDateString()}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        leftSection={<IconTrash size={12} />}
                        onClick={() => uninstall(item.listingId)}
                      >
                        Remove
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      {/* Add New Modal */}
      <Modal opened={addModalOpened} onClose={closeAddModal} title={`Add New ${typeDisplayNames[activeTab] ?? 'Item'}`}>
        <Stack gap="md">
          <TextInput
            label="Name"
            placeholder="Enter a name..."
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            required
          />
          <Textarea
            label="Description"
            placeholder="Brief description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.currentTarget.value)}
            rows={3}
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={closeAddModal}>
              Cancel
            </Button>
            <Button onClick={handleAddNew} disabled={!newName.trim()}>
              Add {typeDisplayNames[activeTab] ?? 'Item'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Custom Item Detail / Edit Modal */}
      <Modal
        opened={detailModalOpened}
        onClose={closeDetailModal}
        title={`Edit ${typeDisplayNames[viewingListing?.type ?? ''] ?? 'Item'}`}
      >
        {viewingListing && (
          <Stack gap="md">
            <TextInput label="Name" value={editName} onChange={(e) => setEditName(e.currentTarget.value)} required />
            <Textarea
              label="Description"
              value={editDescription}
              onChange={(e) => setEditDescription(e.currentTarget.value)}
              rows={3}
            />
            <Group justify="space-between" mt="sm">
              <Button
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() => {
                  uninstall(viewingListing.id);
                  closeDetailModal();
                }}
              >
                Remove
              </Button>
              <Group gap="sm">
                <Button variant="subtle" onClick={closeDetailModal}>
                  Cancel
                </Button>
                <Button
                  disabled={!editName.trim()}
                  onClick={() => {
                    updateCustomListing(viewingListing.id, editName.trim(), editDescription.trim() || undefined);
                    closeDetailModal();
                  }}
                >
                  Save
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Modal>
    </Box>
  );
}

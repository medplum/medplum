// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  Badge,
  Box,
  Card,
  Center,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import type { ComponentType, JSX } from 'react';
import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  listingIconComponent,
  listings,
  typeBadgeColor,
  typeBrowseLabels,
  typeDisplayNames,
  typeIconComponent,
} from './data';
import { useMarketplaceBreadcrumbs } from './MarketplaceLayout';
import { useMarketplace } from './MarketplaceContext';
import type { MarketplaceListing } from './types';

// ─── Listing Card ───────────────────────────────────────────────────────────

function ListingIcon({
  listing,
  TypeIcon,
}: {
  readonly listing: MarketplaceListing;
  readonly TypeIcon: ComponentType<{ size: number }>;
}): JSX.Element {
  if (listing.icon) {
    return (
      <Box w={48} h={48} style={{ borderRadius: 10, overflow: 'hidden', flexShrink: 0, border: '1px solid var(--mantine-color-gray-2)', background: 'white' }}>
        <img src={listing.icon} alt={listing.name} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: '0.5rem' }} />
      </Box>
    );
  }
  if (listingIconComponent[listing.id]) {
    return (
      <Box w={48} h={48} style={{ borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--mantine-color-gray-2)', background: 'white' }}>
        <TypeIcon size={24} />
      </Box>
    );
  }
  return (
    <ThemeIcon size="48px" radius="md" variant="light" color={typeBadgeColor[listing.type] ?? 'gray'} style={{ flexShrink: 0 }}>
      <TypeIcon size={18} />
    </ThemeIcon>
  );
}

function ListingCard({ listing }: { readonly listing: MarketplaceListing }): JSX.Element {
  const { isInstalled } = useMarketplace();
  const installed = isInstalled(listing.id);
  const TypeIcon = listingIconComponent[listing.id] ?? typeIconComponent[listing.type] ?? typeIconComponent['App'];

  return (
    <Card
      component={Link}
      to={`/marketplace/${listing.id}`}
      shadow="sm"
      padding="lg"
      radius="lg"
      withBorder={false}
      style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', border: '1px solid var(--mantine-color-gray-1)' }}
    >
      <Group justify="space-between" mb="sm" wrap="nowrap" style={{ overflow: 'hidden' }}>
        <Group gap="sm" wrap="nowrap" style={{ overflow: 'hidden', minWidth: 0 }}>
          <ListingIcon listing={listing} TypeIcon={TypeIcon} />
          <div style={{ overflow: 'hidden', minWidth: 0 }}>
            <Text fw={700} size="lg" lineClamp={1}>
              {listing.name}
            </Text>
            <Text size="xs" c="dimmed" fw={500}>
              {typeDisplayNames[listing.type] ?? listing.type}
            </Text>
          </div>
        </Group>
        {installed && (
          <Badge size="xs" variant="light" color="green">
            Installed
          </Badge>
        )}
      </Group>

      <Text size="lg" c="gray.7" lineClamp={3} mb="xl" style={{ flex: 1 }}>
        {listing.tagline}
      </Text>

      <Group gap="4">
        {listing.categories.slice(0, 2).map((cat) => (
          <Badge key={cat} size="md" variant="light" color="gray.5" c="dark.3" style={{ textTransform: 'none', fontWeight: 500 }}>
            {cat}
          </Badge>
        ))}
      </Group>
    </Card>
  );
}

// ─── Browse Page ────────────────────────────────────────────────────────────

export function BrowsePage(): JSX.Element {
  const [searchParams] = useSearchParams();

  const filterType = searchParams.get('type') ?? '';
  const filterCategory = searchParams.get('category') ?? '';

  let title = 'Browse Marketplace';
  if (filterType) {
    title = typeBrowseLabels[filterType] ?? filterType;
  } else if (filterCategory) {
    title = filterCategory;
  }

  const filtered = useMemo(() => {
    let result = [...listings];
    if (filterType) {
      result = result.filter((l) => l.type === filterType);
    }
    if (filterCategory) {
      result = result.filter((l) => l.categories.includes(filterCategory));
    }
    return result.sort((a, b) => b.popularity - a.popularity);
  }, [filterType, filterCategory]);

  const { setBreadcrumbs } = useMarketplaceBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: title }]);
    return () => setBreadcrumbs([]);
  }, [title, setBreadcrumbs]);

  return (
    <Box px="xl" py="xl">
      {filtered.length > 0 ? (
        <Box mb="64px">
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {filtered.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </SimpleGrid>
        </Box>
      ) : (
        <Center py="xl">
          <Stack align="center" gap="xs">
            <IconSearch size={48} color="gray" />
            <Text fw={500}>No listings found</Text>
          </Stack>
        </Center>
      )}
    </Box>
  );
}

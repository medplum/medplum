// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Anchor, Badge, Box, Card, Divider, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconPackages } from '@tabler/icons-react';
import type { ComponentType, JSX } from 'react';
import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import {
  allCategories,
  allTypes,
  collections,
  getListingById,
  listingIconComponent,
  listings,
  typeBadgeColor,
  typeDisplayNames,
  typeIconComponent,
} from './data';
import { useMarketplace } from './MarketplaceContext';
import { useMarketplaceBreadcrumbs } from './MarketplaceLayout';
import type { ListingType, MarketplaceListing } from './types';

// ─── URL helpers ────────────────────────────────────────────────────────────

function browseByType(type: string): string {
  const params = new URLSearchParams({ type });
  return `/marketplace/browse?${params.toString()}`;
}

function browseByCategory(category: string): string {
  const params = new URLSearchParams({ category });
  return `/marketplace/browse?${params.toString()}`;
}

// ─── Type Card ──────────────────────────────────────────────────────────────

function TypeCard({ type, isCollection }: { readonly type: string; readonly isCollection?: boolean }): JSX.Element {
  const Icon = isCollection
    ? (typeIconComponent['Collections'] ?? IconPackages)
    : (typeIconComponent[type] ?? IconPackages);
  const displayName = isCollection ? 'Collections' : (typeDisplayNames[type] ?? type);
  const link = isCollection ? '/marketplace/collections' : browseByType(type);

  return (
    <Card
      component={Link}
      to={link}
      padding="md"
      radius="md"
      withBorder
      style={{ textDecoration: 'none', color: 'inherit', textAlign: 'left' }}
    >
      <Stack align="center" gap="xs">
        <ThemeIcon
          size={48}
          radius="md"
          variant="light"
          color={isCollection ? typeBadgeColor['Collections'] : (typeBadgeColor[type] ?? 'gray')}
        >
          <Icon size={24} />
        </ThemeIcon>
        <Text size="sm" fw={400} lineClamp={1}>
          {displayName}
        </Text>
      </Stack>
    </Card>
  );
}

// ─── Listing Icon ────────────────────────────────────────────────────────────

function ListingIcon({
  listing,
  TypeIcon,
}: {
  readonly listing: MarketplaceListing;
  readonly TypeIcon: ComponentType<{ size: number }>;
}): JSX.Element {
  if (listing.icon) {
    return (
      <Box
        w={48}
        h={48}
        style={{
          borderRadius: 10,
          overflow: 'hidden',
          flexShrink: 0,
          border: '1px solid var(--mantine-color-gray-2)',
          background: 'white',
        }}
      >
        <img
          src={listing.icon}
          alt={listing.name}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: '0.5rem' }}
        />
      </Box>
    );
  }
  if (listingIconComponent[listing.id]) {
    return (
      <Box
        w={48}
        h={48}
        style={{
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          border: '1px solid var(--mantine-color-gray-2)',
          background: 'white',
        }}
      >
        <TypeIcon size={24} />
      </Box>
    );
  }
  return (
    <ThemeIcon
      size="48px"
      radius="md"
      variant="light"
      color={typeBadgeColor[listing.type] ?? 'gray'}
      style={{ flexShrink: 0 }}
    >
      <TypeIcon size={18} />
    </ThemeIcon>
  );
}

// ─── Listing Card ───────────────────────────────────────────────────────────

function ListingCard({ listing }: { readonly listing: MarketplaceListing }): JSX.Element {
  const { isInstalled } = useMarketplace();
  const installed = isInstalled(listing.id);
  const TypeIcon = listingIconComponent[listing.id] ?? typeIconComponent[listing.type] ?? IconPackages;

  return (
    <Card
      component={Link}
      to={`/marketplace/${listing.id}`}
      shadow="sm"
      padding="lg"
      radius="lg"
      withBorder={false}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--mantine-color-gray-1)',
      }}
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

      <Text size="lg" c="gray.6" lineClamp={3} mb="xl" style={{ flex: 1 }}>
        {listing.tagline}
      </Text>

      <Group gap="4">
        {listing.categories.slice(0, 2).map((cat) => (
          <Badge
            key={cat}
            size="md"
            variant="light"
            color="gray.5"
            c="dark.3"
            style={{ textTransform: 'none', fontWeight: 500 }}
          >
            {cat}
          </Badge>
        ))}
      </Group>
    </Card>
  );
}

// ─── Collection Card ────────────────────────────────────────────────────────

function CollectionCard({
  collection,
}: {
  readonly collection: { id: string; name: string; description: string; listingIds: string[] };
}): JSX.Element {
  // Derive categories from the collection's listings
  const categories = useMemo(() => {
    const catSet = new Set<string>();
    collection.listingIds.forEach((id) => {
      const listing = getListingById(id);
      listing?.categories.forEach((c) => catSet.add(c));
    });
    return Array.from(catSet).slice(0, 2);
  }, [collection.listingIds]);

  return (
    <Card
      component={Link}
      to={`/marketplace/collections/${collection.id}`}
      shadow="sm"
      padding="lg"
      radius="lg"
      withBorder={false}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--mantine-color-gray-1)',
      }}
    >
      <Group gap="sm" mb="sm" wrap="nowrap" style={{ overflow: 'hidden' }}>
        <ThemeIcon size="48px" radius="md" variant="light" color="grape" style={{ flexShrink: 0 }}>
          <IconPackages size={18} />
        </ThemeIcon>
        <div style={{ overflow: 'hidden', minWidth: 0 }}>
          <Text fw={700} size="lg" lineClamp={1}>
            {collection.name}
          </Text>
          <Text size="xs" c="dimmed" fw={500}>
            Collection
          </Text>
        </div>
      </Group>
      <Text size="lg" c="gray.6" lineClamp={3} mb="xl" style={{ flex: 1 }}>
        {collection.description}
      </Text>
      <Group gap="4">
        {categories.map((cat) => (
          <Badge
            key={cat}
            size="md"
            variant="light"
            color="gray.5"
            c="dark.3"
            style={{ textTransform: 'none', fontWeight: 500 }}
          >
            {cat}
          </Badge>
        ))}
      </Group>
    </Card>
  );
}

// ─── Section ────────────────────────────────────────────────────────────────

interface SectionConfig {
  readonly title: string;
  readonly type?: ListingType;
  readonly category?: string;
  readonly isCollections?: boolean;
  readonly maxRows: number;
  readonly seeAllLabel: string;
  readonly seeAllLink: string;
}

function MerchandisedSection({ config }: { readonly config: SectionConfig }): JSX.Element | null {
  const items = useMemo(() => {
    if (config.isCollections) {
      return [];
    }
    let result = [...listings];
    if (config.type) {
      result = result.filter((l) => l.type === config.type);
    }
    if (config.category) {
      result = result.filter((l) => config.category && l.categories.includes(config.category));
    }
    // Sort by popularity
    result.sort((a, b) => b.popularity - a.popularity);
    return result.slice(0, config.maxRows * 4);
  }, [config]);

  // Collections section
  if (config.isCollections) {
    const displayCollections = collections.slice(0, config.maxRows * 4);
    if (displayCollections.length === 0) {
      return null;
    }
    return (
      <Box mb="64px">
        <Group justify="space-between" mb="md" mx="4">
          <Title order={3} size="h4" fw={800}>
            {config.title}
          </Title>
          <Anchor
            component={Link}
            to={config.seeAllLink}
            size="sm"
            c="blue.6"
            fw={500}
            style={{ textDecoration: 'none' }}
          >
            See all {config.seeAllLabel} &rarr;
          </Anchor>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          {displayCollections.map((col) => (
            <CollectionCard key={col.id} collection={col} />
          ))}
        </SimpleGrid>
      </Box>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <Box mb="64px">
      <Group justify="space-between" mb="md" mx="4">
        <Title order={3} size="h4" fw={800}>
          {config.title}
        </Title>
        <Anchor
          component={Link}
          to={config.seeAllLink}
          size="sm"
          c="blue.6"
          fw={500}
          style={{ textDecoration: 'none' }}
        >
          See All {config.seeAllLabel} &rarr;
        </Anchor>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
        {items.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </SimpleGrid>
    </Box>
  );
}

// ─── Section configuration ──────────────────────────────────────────────────

const merchandisedSections: SectionConfig[] = [
  {
    title: 'Popular Apps',
    type: 'App',
    maxRows: 1,
    seeAllLabel: 'Apps',
    seeAllLink: browseByType('App'),
  },
  {
    title: 'Data & Content',
    type: 'Content Pack',
    maxRows: 1,
    seeAllLabel: 'Data & Content',
    seeAllLink: browseByType('Content Pack'),
  },
  {
    title: 'Collections',
    isCollections: true,
    maxRows: 1,
    seeAllLabel: 'Collections',
    seeAllLink: '/marketplace/collections',
  },
  {
    title: 'Compliance',
    category: 'Compliance',
    maxRows: 2,
    seeAllLabel: 'Compliance',
    seeAllLink: browseByCategory('Compliance'),
  },
  {
    title: 'Service Providers',
    type: 'Service Provider',
    maxRows: 1,
    seeAllLabel: 'Service Providers',
    seeAllLink: browseByType('Service Provider'),
  },
  {
    title: 'Decision Support',
    category: 'Decision Support',
    maxRows: 2,
    seeAllLabel: 'Decision Support',
    seeAllLink: browseByCategory('Decision Support'),
  },
  {
    title: 'Automations',
    type: 'Automation',
    maxRows: 1,
    seeAllLabel: 'Automations',
    seeAllLink: browseByType('Automation'),
  },
];

// ─── Main Page ──────────────────────────────────────────────────────────────

export function MarketplacePage(): JSX.Element {
  const { setBreadcrumbs } = useMarketplaceBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  return (
    <Box px="xl" py="xl">
      {/* Type cards */}
      <SimpleGrid cols={{ base: 3, sm: 4, md: 7 }} spacing="lg" mb="lg">
        {allTypes.map((type) => (
          <TypeCard key={type} type={type} />
        ))}
        <TypeCard type="Collections" isCollection />
      </SimpleGrid>

      {/* Category pills */}
      <Group gap="xs" mb="xl" justify="center">
        {allCategories.map((cat) => (
          <Badge
            key={cat}
            component={Link}
            to={browseByCategory(cat)}
            size="lg"
            variant="light"
            color="gray.6"
            c="dark.6"
            style={{ cursor: 'pointer', textDecoration: 'none', textTransform: 'none', fontWeight: 500, minHeight: 36 }}
          >
            {cat}
          </Badge>
        ))}
      </Group>

      <Divider mb="xl" />

      {/* Merchandised sections */}
      {merchandisedSections.map((section) => (
        <MerchandisedSection key={section.title} config={section} />
      ))}
    </Box>
  );
}

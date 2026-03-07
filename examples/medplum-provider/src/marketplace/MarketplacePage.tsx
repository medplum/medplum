// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Anchor, Badge, Box, Card, Divider, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconBookmarksFilled } from '@tabler/icons-react';
import type { ComponentType, JSX } from 'react';
import React, { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import {
  allCategories,
  allTypes,
  collections,
  getListingById,
  listingIconColor,
  listingIconComponent,
  listings,
  typeBadgeColor,
  typeDisplayNames,
  typeIconComponent,
} from './data';
import type { ListingType, MarketplaceListing } from './types';
import { useMarketplace } from './useMarketplace';
import { useMarketplaceBreadcrumbs } from './useMarketplaceBreadcrumbs';

// ─── URL helpers ────────────────────────────────────────────────────────────

function browseByType(type: string): string {
  const params = new URLSearchParams({ type });
  return `/marketplace/browse?${params.toString()}`;
}

function browseByCategory(category: string): string {
  const params = new URLSearchParams({ category });
  return `/marketplace/browse?${params.toString()}`;
}

// ─── Listing Icon ────────────────────────────────────────────────────────────

function ListingIcon({
  listing,
  TypeIcon,
}: {
  readonly listing: MarketplaceListing;
  readonly TypeIcon: ComponentType<{ size: number; color?: string }>;
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
        <TypeIcon size={24} color={listingIconColor[listing.id]} />
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
  const TypeIcon = listingIconComponent[listing.id] ?? typeIconComponent[listing.type] ?? IconBookmarksFilled;

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

      <Text size="lg" c="gray.7" lineClamp={3} mb="xl" pr="xs" style={{ flex: 1 }}>
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
          <IconBookmarksFilled size={18} />
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
      <Text size="lg" c="gray.7" lineClamp={3} mb="xl" style={{ flex: 1 }}>
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
    return result.slice(0, config.maxRows * 3);
  }, [config]);

  // Collections section
  if (config.isCollections) {
    const displayCollections = collections.slice(0, config.maxRows * 3);
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
    <Box py="xl" style={{ paddingInline: 'calc(var(--mantine-spacing-xl) * 3)' }}>
      {/* Browse filters — two column layout */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" mb="64px">
        {/* Left: Browse by Type */}
        <Stack gap="sm">
          <Title order={6} fw={700} mb={4}>
            Browse by Type
          </Title>
          <Group gap="xs" wrap="wrap">
            {allTypes.map((type) => {
              const Icon = typeIconComponent[type] ?? IconBookmarksFilled;
              const color = typeBadgeColor[type] ?? 'gray';
              return (
                <Box
                  key={type}
                  component={Link}
                  to={browseByType(type)}
                  className="marketplace-type-chip"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px 18px',
                    borderRadius: 'var(--mantine-radius-md)',
                    textDecoration: 'none',
                    color: 'var(--mantine-color-dark-6)',
                    fontSize: 'var(--mantine-font-size-md)',
                    fontWeight: 500,
                  }}
                >
                  <Icon size={18} color={`var(--mantine-color-${color}-6)`} style={{ flexShrink: 0 }} />
                  {typeDisplayNames[type] ?? type}
                </Box>
              );
            })}
            <Box
              component={Link}
              to="/marketplace/collections"
              className="marketplace-type-chip"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 18px',
                borderRadius: 'var(--mantine-radius-md)',
                textDecoration: 'none',
                color: 'var(--mantine-color-dark-6)',
                fontSize: 'var(--mantine-font-size-md)',
                fontWeight: 500,
              }}
            >
              <IconBookmarksFilled size={14} color="var(--mantine-color-grape-6)" style={{ flexShrink: 0 }} />
              Collections
            </Box>
          </Group>
        </Stack>

        {/* Right: Browse by Category */}
        <Stack gap="sm">
          <Title order={6} fw={700} mb={4}>
            Browse by Category
          </Title>
          <Group gap="xs" wrap="wrap">
            {allCategories.map((cat) => (
              <Box
                key={cat}
                component={Link}
                to={browseByCategory(cat)}
                className="marketplace-type-chip"
                style={
                  {
                    ['--chip-bg' as string]: 'var(--mantine-color-gray-1)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '7px 14px',
                    borderRadius: 9999,
                    textDecoration: 'none',
                    color: 'var(--mantine-color-dark-3)',
                    fontSize: 'var(--mantine-font-size-sm)',
                    fontWeight: 500,
                  } as React.CSSProperties
                }
              >
                {cat}
              </Box>
            ))}
          </Group>
        </Stack>
      </SimpleGrid>

      <Divider />

      {/* Merchandised sections */}
      {merchandisedSections.map((section, i) => (
        <Box key={section.title} mt={i === 0 ? 'xl' : undefined}>
          <MerchandisedSection config={section} />
        </Box>
      ))}
    </Box>
  );
}

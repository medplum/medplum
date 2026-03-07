// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconPackages, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import {
  getCollectionById,
  getListingsForCollection,
  typeBadgeColor,
  typeDisplayNames,
  typeIconComponent,
} from './data';
import { useMarketplace } from './useMarketplace';
import { useMarketplaceBreadcrumbs } from './useMarketplaceBreadcrumbs';
import type { MarketplaceListing } from './types';

function CollectionListingCard({ listing }: { readonly listing: MarketplaceListing }): JSX.Element {
  const { isInstalled } = useMarketplace();
  const installed = isInstalled(listing.id);
  const TypeIcon = typeIconComponent[listing.type] ?? typeIconComponent['App'];

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
          <ThemeIcon
            size="48px"
            radius="md"
            variant="light"
            color={typeBadgeColor[listing.type] ?? 'gray'}
            style={{ flexShrink: 0 }}
          >
            <TypeIcon size={18} />
          </ThemeIcon>
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

export function CollectionDetailPage(): JSX.Element {
  const { collectionId } = useParams<{ collectionId: string }>();
  const collection = collectionId ? getCollectionById(collectionId) : undefined;
  const { setBreadcrumbs } = useMarketplaceBreadcrumbs();

  useEffect(() => {
    if (collection) {
      setBreadcrumbs([{ label: 'Collections', to: '/marketplace/collections' }, { label: collection.name }]);
    }
    return () => setBreadcrumbs([]);
  }, [collection, setBreadcrumbs]);

  if (!collection) {
    return (
      <Center py="xl">
        <Stack align="center" gap="xs">
          <Text fw={500}>Collection not found</Text>
          <Anchor component={Link} to="/marketplace/collections" size="sm">
            Back to Collections
          </Anchor>
        </Stack>
      </Center>
    );
  }

  const collectionListings = getListingsForCollection(collection.id);

  return (
    <Box py="xl" style={{ paddingInline: 'calc(var(--mantine-spacing-xl) * 3)' }}>
      <Group mb="md" gap="md" justify="space-between" wrap="wrap" mx="4">
        <Group gap="md">
          <ThemeIcon size={48} radius="md" variant="light" color="grape">
            <IconPackages size={28} />
          </ThemeIcon>
          <div>
            <Title order={3} size="h4" fw={800}>
              {collection.name}
            </Title>
            <Text size="sm" c="dimmed">
              {collectionListings.length} items in this collection
            </Text>
          </div>
        </Group>
        <Button leftSection={<IconPlus size={16} />} size="md">
          Set Up All {collectionListings.length} Items
        </Button>
      </Group>

      <Text size="sm" mb="lg" maw={700}>
        {collection.description}
      </Text>

      <Box mb="64px">
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          {collectionListings.map((listing) => (
            <CollectionListingCard key={listing.id} listing={listing} />
          ))}
        </SimpleGrid>
      </Box>
    </Box>
  );
}

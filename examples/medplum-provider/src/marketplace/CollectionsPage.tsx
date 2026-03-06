// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Box, Card, Group, SimpleGrid, Text, ThemeIcon, Title } from '@mantine/core';
import { IconPackages } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { collections } from './data';
import { useMarketplaceBreadcrumbs } from './MarketplaceLayout';

export function CollectionsPage(): JSX.Element {
  const { setBreadcrumbs } = useMarketplaceBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: 'Collections' }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  return (
    <Box px="xl" py="xl">
      <Group mb="lg" mx="4">
        <Title order={3} size="h4" fw={800}>
          Collections
        </Title>
      </Group>

      <Text c="dimmed" size="sm" mb="lg" maw={600}>
        Collections are curated sets of apps, templates, bots, and content packs organized around a theme. Install
        everything you need for a specific use case in one place.
      </Text>

      <Box mb="64px">
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          {collections.map((col) => (
            <Card
              key={col.id}
              component={Link}
              to={`/marketplace/collections/${col.id}`}
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
                    {col.name}
                  </Text>
                  <Text size="xs" c="dimmed" fw={500}>
                    {col.listingIds.length} items
                  </Text>
                </div>
              </Group>
              <Text size="lg" c="gray.7" lineClamp={3} style={{ flex: 1 }}>
                {col.description}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      </Box>
    </Box>
  );
}

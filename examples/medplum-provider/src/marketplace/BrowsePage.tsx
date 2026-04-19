// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Badge, Box, Card, Center, Group, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core';
import { formatCodeableConcept } from '@medplum/core';
import type { Package, PackageInstallation } from '@medplum/fhirtypes';
import { AttachmentDisplay, Loading, useSearchResources } from '@medplum/react';
import { IconAppWindow, IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';

// ─── Listing Card ───────────────────────────────────────────────────────────

interface ListingIconProps {
  readonly listing: Package;
}

function ListingIcon({ listing }: ListingIconProps): JSX.Element {
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
        <AttachmentDisplay value={listing.icon} />
      </Box>
    );
  }
  return (
    <ThemeIcon size="48px" radius="md" variant="light" color="gray" style={{ flexShrink: 0 }}>
      <IconAppWindow size={18} />
    </ThemeIcon>
  );
}

interface ListingCardProps {
  readonly listing: Package;
  readonly installation: PackageInstallation | undefined;
}

function ListingCard({ listing, installation }: ListingCardProps): JSX.Element {
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
          <ListingIcon listing={listing} />
          <div style={{ overflow: 'hidden', minWidth: 0 }}>
            <Text fw={700} size="lg" lineClamp={1}>
              {listing.name}
            </Text>
          </div>
        </Group>
        {installation && (
          <Badge size="xs" variant="light" color="green">
            Installed
          </Badge>
        )}
      </Group>

      <Text size="lg" c="gray.7" lineClamp={3} mb="xl" style={{ flex: 1 }}>
        {listing.short}
      </Text>

      <Group gap="4">
        {listing.category?.slice(0, 2).map((cat) => (
          <Badge
            key={cat.coding?.[0]?.code}
            size="lg"
            variant="light"
            color="gray.5"
            c="dark.3"
            style={{ textTransform: 'none', fontWeight: 500 }}
          >
            {formatCodeableConcept(cat)}
          </Badge>
        ))}
      </Group>
    </Card>
  );
}

// ─── Browse Page ────────────────────────────────────────────────────────────

export function BrowsePage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const [listings, listingsLoading] = useSearchResources('Package', { _count: 100 });
  const [installed, installedLoading] = useSearchResources('PackageInstallation', { _count: 100 });

  const filterCategory = searchParams.get('category') ?? '';

  const filtered = useMemo(() => {
    if (!listings) {
      return [];
    }
    let result = [...listings];
    if (filterCategory) {
      result = result.filter((l) => l.category?.some((cat) => cat.coding?.[0]?.code === filterCategory));
    }
    return result;
  }, [listings, filterCategory]);

  if (listingsLoading || installedLoading) {
    return <Loading />;
  }

  return (
    <Box py="xl" style={{ paddingInline: 'calc(var(--mantine-spacing-xl) * 3)' }}>
      {filtered.length > 0 ? (
        <Box mb="64px">
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {filtered.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                installation={installed?.find((i) => i.package?.reference?.includes(listing.id))}
              />
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

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Badge, Box, Card, Divider, Group, SimpleGrid, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
import { IconBuildingSkyscraper } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { listings } from './data';
import { useMarketplaceBreadcrumbs } from './MarketplaceLayout';
import type { MarketplaceListing } from './types';

const allServiceTypes = Array.from(
  new Set(listings.filter((l) => l.type === 'Service Provider').flatMap((l) => l.serviceTypes ?? []))
).sort();

function PartnerCard({ listing }: { readonly listing: MarketplaceListing }): JSX.Element {
  return (
    <Card
      component={Link}
      to={`/marketplace/${listing.id}`}
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <Group gap="xs" mb="xs">
        <ThemeIcon size="lg" radius="md" variant="light" color="cyan">
          <IconBuildingSkyscraper size={18} />
        </ThemeIcon>
        <div>
          <Text fw={600} size="md" lineClamp={1}>
            {listing.name}
          </Text>
          <Text size="sm" c="dimmed">
            {listing.vendor.name}
          </Text>
        </div>
      </Group>

      <Text size="md" c="dimmed" lineClamp={2} mb="sm">
        {listing.tagline}
      </Text>

      <Group gap="xs">
        {listing.serviceTypes?.map((st) => (
          <Badge key={st} size="xs" variant="light" color="cyan">
            {st}
          </Badge>
        ))}
      </Group>
    </Card>
  );
}

export function PartnersPage(): JSX.Element {
  const [selectedServiceType, setSelectedServiceType] = useState<string>('');
  const { setBreadcrumbs } = useMarketplaceBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: 'Partners & Service Providers' }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const serviceProviders = useMemo(() => {
    let result = listings.filter((l) => l.type === 'Service Provider');
    if (selectedServiceType) {
      result = result.filter((l) => l.serviceTypes?.includes(selectedServiceType));
    }
    return result;
  }, [selectedServiceType]);

  return (
    <Box px="xl" py="xl">
      <Group mb="xs" mx="4">
        <Title order={3} size="h4" fw={800}>
          Partners & Service Providers
        </Title>
      </Group>

      <Text c="dimmed" size="sm" mb="lg" maw={600}>
        Find professional services firms specializing in Medplum implementations, compliance, clinical content, and
        more.
      </Text>

      {/* Service type filter */}
      <Box mb="lg">
        <Text size="xs" fw={500} c="dimmed" mb={4}>
          Service Type
        </Text>
        <Group gap="xs">
          <UnstyledButton onClick={() => setSelectedServiceType('')}>
            <Badge
              size="lg"
              variant={selectedServiceType === '' ? 'filled' : 'outline'}
              color={selectedServiceType === '' ? 'blue' : 'gray'}
              style={{ cursor: 'pointer', textTransform: 'none' }}
            >
              All
            </Badge>
          </UnstyledButton>
          {allServiceTypes.map((st) => (
            <UnstyledButton key={st} onClick={() => setSelectedServiceType(selectedServiceType === st ? '' : st)}>
              <Badge
                size="lg"
                variant={selectedServiceType === st ? 'filled' : 'outline'}
                color={selectedServiceType === st ? 'blue' : 'gray'}
                style={{ cursor: 'pointer', textTransform: 'none' }}
              >
                {st}
              </Badge>
            </UnstyledButton>
          ))}
        </Group>
      </Box>

      <Divider mb="md" />

      <Box mb="64px">
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          {serviceProviders.map((listing) => (
            <PartnerCard key={listing.id} listing={listing} />
          ))}
        </SimpleGrid>
      </Box>
    </Box>
  );
}

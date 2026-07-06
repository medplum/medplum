// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Divider,
  Drawer,
  Group,
  Loader,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { getExtensionValue, normalizeErrorString } from '@medplum/core';
import type { Basic } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCircleOff, IconShoppingCart, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CartProvider, useCart } from '../marketplace/CartContext';

const CATALOG_SYSTEM = 'https://medsscript.com/catalog';
const ITEM_NAME_URL = 'https://medsscript.com/item-name';
const ITEM_CATEGORY_URL = 'https://medsscript.com/item-category';
const ITEM_PRICE_URL = 'https://medsscript.com/item-price-usd';
const ITEM_UNIT_URL = 'https://medsscript.com/item-unit';

type CatalogCategory = '503A' | 'peptide' | 'diagnostic';

interface CatalogItem {
  id: string;
  name: string;
  category?: string;
  price?: number;
  unit?: string;
}

interface CategorySection {
  key: CatalogCategory;
  title: string;
}

const CATEGORY_SECTIONS: CategorySection[] = [
  { key: '503A', title: '503A Prescriptions' },
  { key: 'peptide', title: 'Research Peptides' },
  { key: 'diagnostic', title: 'Diagnostic Kits' },
];

const CATEGORY_LABELS: Record<string, string> = {
  '503A': '503A',
  peptide: 'Peptide',
  diagnostic: 'Diagnostic',
};

const CATEGORY_COLORS: Record<string, string> = {
  '503A': 'blue',
  peptide: 'grape',
  diagnostic: 'teal',
};

function readNumber(resource: Basic, url: string): number | undefined {
  const value = getExtensionValue(resource, url) as number | string | undefined;
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function formatUsd(value: number | undefined): string {
  if (value === undefined) {
    return '—';
  }
  return `$${value.toFixed(2)}`;
}

function CartDrawer({ opened, onClose }: { opened: boolean; onClose: () => void }): JSX.Element {
  const { items, total, removeItem, setQty, clear } = useCart();
  return (
    <Drawer opened={opened} onClose={onClose} position="right" title="Your Cart" size="md">
      {items.length === 0 ? (
        <Text c="dimmed">Your cart is empty. Add items from the catalog to get started.</Text>
      ) : (
        <Stack gap="md">
          {items.map((line) => (
            <Group key={line.itemId} justify="space-between" wrap="nowrap">
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text fw={500} truncate>
                  {line.name}
                </Text>
                <Text size="sm" c="dimmed">
                  {formatUsd(line.price)} each
                </Text>
              </div>
              <NumberInput
                value={line.qty}
                onChange={(val) => setQty(line.itemId, typeof val === 'number' ? val : Number(val) || 0)}
                min={0}
                w={80}
                size="xs"
                aria-label={`Quantity for ${line.name}`}
              />
              <Text w={80} ta="right">
                {formatUsd(line.price * line.qty)}
              </Text>
              <ActionIcon
                variant="subtle"
                color="red"
                onClick={() => removeItem(line.itemId)}
                aria-label={`Remove ${line.name}`}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}

          <Divider />

          <Group justify="space-between">
            <Text fw={600}>Total</Text>
            <Text fw={600}>{formatUsd(total)}</Text>
          </Group>

          <Button color="red" variant="light" onClick={clear}>
            Clear cart
          </Button>

          <Button disabled fullWidth>
            Checkout
          </Button>
          <Text size="xs" c="dimmed" ta="center">
            Ordering and checkout are coming in a later phase.
          </Text>
        </Stack>
      )}
    </Drawer>
  );
}

function ItemCard({ item }: { item: CatalogItem }): JSX.Element {
  const { addItem } = useCart();
  return (
    <Card withBorder radius="md" padding="lg">
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Text fw={600} truncate>
          {item.name}
        </Text>
        {item.category && (
          <Badge color={CATEGORY_COLORS[item.category] ?? 'gray'} variant="light">
            {CATEGORY_LABELS[item.category] ?? item.category}
          </Badge>
        )}
      </Group>
      <Text size="lg" fw={700}>
        {formatUsd(item.price)}
      </Text>
      {item.unit && (
        <Text size="sm" c="dimmed" mb="md">
          per {item.unit}
        </Text>
      )}
      <Button
        mt="auto"
        fullWidth
        leftSection={<IconShoppingCart size={16} />}
        disabled={item.price === undefined}
        onClick={() => addItem({ itemId: item.id, name: item.name, price: item.price ?? 0 })}
      >
        Add to cart
      </Button>
    </Card>
  );
}

function MarketplaceContent(): JSX.Element {
  const medplum = useMedplum();
  const { itemCount } = useCart();
  const [items, setItems] = useState<CatalogItem[]>();
  const [drawerOpened, drawerHandlers] = useDisclosure(false);

  const load = useCallback(() => {
    medplum
      .searchResources('Basic', `identifier=${encodeURIComponent(CATALOG_SYSTEM + '|')}&_count=200`)
      .then((results) => {
        setItems(
          results.map((resource) => ({
            id: resource.id as string,
            name: (getExtensionValue(resource, ITEM_NAME_URL) as string | undefined) ?? '(unnamed item)',
            category: getExtensionValue(resource, ITEM_CATEGORY_URL) as string | undefined,
            price: readNumber(resource, ITEM_PRICE_URL),
            unit: getExtensionValue(resource, ITEM_UNIT_URL) as string | undefined,
          }))
        );
      })
      .catch((err) => {
        showNotification({ color: 'red', icon: <IconCircleOff />, title: 'Error', message: normalizeErrorString(err) });
        setItems([]);
      });
  }, [medplum]);

  useEffect(() => {
    load();
  }, [load]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const item of items ?? []) {
      const key = item.category ?? 'other';
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    }
    return map;
  }, [items]);

  return (
    <Document>
      <Group justify="space-between" mb="md">
        <Title order={2}>Marketplace</Title>
        <Button
          variant="light"
          leftSection={<IconShoppingCart size={18} />}
          onClick={drawerHandlers.open}
        >
          Cart{itemCount > 0 ? ` (${itemCount})` : ''}
        </Button>
      </Group>
      <Text c="dimmed" mb="lg">
        Browse catalog products and build a cart. Ordering will be enabled in a later phase.
      </Text>

      {!items ? (
        <Group justify="center" p="xl">
          <Loader />
        </Group>
      ) : items.length === 0 ? (
        <Text c="dimmed">No catalog items are available yet. Check back soon.</Text>
      ) : (
        <Stack gap="xl">
          {CATEGORY_SECTIONS.map((section) => {
            const sectionItems = itemsByCategory.get(section.key) ?? [];
            if (sectionItems.length === 0) {
              return null;
            }
            return (
              <div key={section.key}>
                <Title order={4} mb="sm">
                  {section.title}
                </Title>
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                  {sectionItems.map((item) => (
                    <ItemCard key={item.id} item={item} />
                  ))}
                </SimpleGrid>
              </div>
            );
          })}
        </Stack>
      )}

      <CartDrawer opened={drawerOpened} onClose={drawerHandlers.close} />
    </Document>
  );
}

export function MarketplacePage(): JSX.Element {
  return (
    <CartProvider>
      <MarketplaceContent />
    </CartProvider>
  );
}

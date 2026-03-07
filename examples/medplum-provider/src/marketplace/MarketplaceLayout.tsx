// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Box, Button, Divider, Group, Text } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import './Marketplace.css';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export interface MarketplaceOutletContext {
  setBreadcrumbs: (items: BreadcrumbItem[]) => void;
}

export function MarketplaceLayout(): JSX.Element {
  const [breadcrumbs, setBreadcrumbsRaw] = useState<BreadcrumbItem[]>([]);
  const setBreadcrumbs = useCallback((items: BreadcrumbItem[]) => setBreadcrumbsRaw(items), []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [pathname]);

  return (
    <div className="marketplace-root">
      <Box style={{ backgroundColor: 'var(--mantine-color-body)', flexShrink: 0 }}>
        <Group justify="space-between" py="0.875rem" style={{ paddingInline: 'calc(var(--mantine-spacing-xl) * 3)' }}>
          <Group gap={6} align="baseline">
            {breadcrumbs.length > 0 ? (
              <>
                <Text
                  component={Link}
                  to="/marketplace"
                  className="marketplace-breadcrumb-link"
                  fw={800}
                  size="xl"
                  style={{ lineHeight: 1.3 }}
                >
                  Marketplace
                </Text>
                {breadcrumbs.map((crumb, i) => (
                  <Group key={i} gap={6} align="baseline" wrap="nowrap">
                    <Text c="dimmed" fw={400} size="xl" style={{ lineHeight: 1.3 }}>
                      /
                    </Text>
                    {crumb.to ? (
                      <Text
                        component={Link}
                        to={crumb.to}
                        className="marketplace-breadcrumb-link"
                        fw={800}
                        size="xl"
                        style={{ lineHeight: 1.3 }}
                      >
                        {crumb.label}
                      </Text>
                    ) : (
                      <Text fw={800} size="xl" style={{ lineHeight: 1.3 }}>
                        {crumb.label}
                      </Text>
                    )}
                  </Group>
                ))}
              </>
            ) : (
              <Text fw={800} size="xl" style={{ lineHeight: 1.3 }}>
                Marketplace
              </Text>
            )}
          </Group>
          <Button
            component={Link}
            to="/marketplace/installed"
            size="sm"
            variant="default"
            leftSection={<IconSettings size={16} />}
          >
            Manage Installed
          </Button>
        </Group>
        <Divider style={{ marginInline: 'calc(var(--mantine-spacing-xl) * 3)' }} />
      </Box>
      <Box ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
        <Outlet context={{ setBreadcrumbs }} />
      </Box>
    </div>
  );
}

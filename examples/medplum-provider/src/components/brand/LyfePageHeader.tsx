// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Box, Group, Stack, Text, Title } from '@mantine/core';
import type { JSX, ReactNode } from 'react';

export interface LyfePageHeaderProps {
  /** Rendered inside the tinted tile. Sized by the caller (20px suits the tile). */
  readonly icon?: ReactNode;
  /** Small uppercase kicker above the title. */
  readonly eyebrow?: string;
  readonly title: ReactNode;
  /** Shown as a pill beside the title. Omitted while undefined so it never flashes "0". */
  readonly count?: number;
  readonly description?: string;
  readonly actions?: ReactNode;
}

/**
 * The Lyfe platform's page header: a tinted icon tile, an uppercase eyebrow, a
 * title with an optional count pill, and right-aligned actions.
 *
 * Every colour and radius resolves through Mantine theme variables rather than
 * literal hex, so the header follows `primaryColor` and the slate `gray` ramp
 * defined in `theme.ts` instead of pinning a second copy of the palette here.
 * @param props - Component props.
 * @param props.icon - Rendered inside the tinted tile.
 * @param props.eyebrow - Small uppercase kicker above the title.
 * @param props.title - The page title.
 * @param props.count - Optional count shown as a pill beside the title.
 * @param props.description - Supporting line beneath the title.
 * @param props.actions - Right-aligned action controls.
 * @returns The page header element.
 */
export function LyfePageHeader(props: LyfePageHeaderProps): JSX.Element {
  return (
    <Box
      component="header"
      p="lg"
      style={{
        background: 'var(--mantine-color-white)',
        border: '1px solid var(--mantine-color-gray-2)',
        borderRadius: 12,
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
        <Group align="flex-start" gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
          {props.icon && (
            <Box
              style={{
                width: 44,
                height: 44,
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 'var(--mantine-radius-md)',
                background: 'var(--mantine-color-primary-0)',
                color: 'var(--mantine-primary-color-filled)',
              }}
            >
              {props.icon}
            </Box>
          )}

          <Stack gap={2} style={{ minWidth: 0 }}>
            {props.eyebrow && (
              <Text fw={600} c="gray.5" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                {props.eyebrow}
              </Text>
            )}

            <Group gap="sm" align="center" wrap="nowrap">
              <Title order={1} c="gray.9" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.2 }}>
                {props.title}
              </Title>
              {props.count !== undefined && (
                <Badge variant="light" color="gray" radius="xl" size="lg" style={{ fontWeight: 500 }}>
                  {props.count}
                </Badge>
              )}
            </Group>

            {props.description && (
              <Text size="sm" c="gray.5" style={{ lineHeight: 1.6 }}>
                {props.description}
              </Text>
            )}
          </Stack>
        </Group>

        {props.actions && (
          <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
            {props.actions}
          </Group>
        )}
      </Group>
    </Box>
  );
}

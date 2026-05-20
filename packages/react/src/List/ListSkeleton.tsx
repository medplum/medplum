// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex, Skeleton, Stack } from '@mantine/core';
import type { JSX } from 'react';

const DEFAULT_SKELETON_WIDTHS = [
  ['85%', '60%', '72%'],
  ['70%', '80%', '55%'],
  ['92%', '50%', '65%'],
  ['78%', '68%', '58%'],
  ['88%', '45%', '75%'],
  ['74%', '70%', '62%'],
];

export interface ListSkeletonProps {
  readonly rows?: number;
  readonly linesPerRow?: number;
  /** When true, each row renders a circular avatar placeholder to the left of the lines. */
  readonly withAvatar?: boolean;
  /** Diameter of the avatar placeholder when `withAvatar` is set. Defaults to 40. */
  readonly avatarSize?: number;
}

/**
 * Skeleton placeholder for a list while it loads. Renders a configurable
 * number of rows, each with one or more shimmer lines and an optional
 * circular avatar placeholder. Row gap and inner padding mirror `ListItem`'s
 * loaded rhythm (`Stack gap={2}` between rows, ~8px / 10px row padding) so
 * the layout doesn't visibly shift when real content arrives.
 * @param props - Skeleton shape options (rows, linesPerRow, withAvatar, avatarSize).
 * @returns The skeleton element.
 */
export function ListSkeleton(props: ListSkeletonProps): JSX.Element {
  const { rows = DEFAULT_SKELETON_WIDTHS.length, linesPerRow = 3, withAvatar = false, avatarSize = 40 } = props;
  const widths = takeRows(rows);

  return (
    <Stack gap={2}>
      {widths.map((rowWidths, index) => (
        <Box key={index} px="xs" py="sm">
          {withAvatar ? (
            <Flex gap="sm" align="flex-start">
              <Skeleton height={avatarSize} width={avatarSize} radius="50%" />
              <Box style={{ flex: 1 }}>
                <Flex direction="column" gap="xs">
                  {rowWidths.slice(0, linesPerRow).map((w, i) => (
                    <Skeleton key={i} height={i === 0 ? 16 : 14} width={w} />
                  ))}
                </Flex>
              </Box>
            </Flex>
          ) : (
            <Flex direction="column" gap="xs" align="flex-start">
              {rowWidths.slice(0, linesPerRow).map((w, i) => (
                <Skeleton key={i} height={i === 0 ? 16 : 14} width={w} />
              ))}
            </Flex>
          )}
        </Box>
      ))}
    </Stack>
  );
}

function takeRows(rows: number): string[][] {
  if (rows <= DEFAULT_SKELETON_WIDTHS.length) {
    return DEFAULT_SKELETON_WIDTHS.slice(0, rows);
  }
  // Repeat the pattern when callers ask for more rows than the seed array.
  const out: string[][] = [];
  for (let i = 0; i < rows; i++) {
    out.push(DEFAULT_SKELETON_WIDTHS[i % DEFAULT_SKELETON_WIDTHS.length]);
  }
  return out;
}

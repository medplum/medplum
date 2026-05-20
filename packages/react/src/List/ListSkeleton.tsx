// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex, Skeleton, Stack } from '@mantine/core';
import type { JSX } from 'react';

interface SkeletonRow {
  readonly id: string;
  readonly widths: readonly string[];
}

const DEFAULT_SKELETON_ROWS: readonly SkeletonRow[] = [
  { id: 'row-1', widths: ['85%', '60%', '72%'] },
  { id: 'row-2', widths: ['70%', '80%', '55%'] },
  { id: 'row-3', widths: ['92%', '50%', '65%'] },
  { id: 'row-4', widths: ['78%', '68%', '58%'] },
  { id: 'row-5', widths: ['88%', '45%', '75%'] },
  { id: 'row-6', widths: ['74%', '70%', '62%'] },
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
  const { rows = DEFAULT_SKELETON_ROWS.length, linesPerRow = 3, withAvatar = false, avatarSize = 40 } = props;
  const skeletonRows = takeRows(rows);

  return (
    <Stack gap={2}>
      {skeletonRows.map((row) => (
        <Box key={row.id} px="xs" py="sm">
          {withAvatar ? (
            <Flex gap="sm" align="flex-start">
              <Skeleton height={avatarSize} width={avatarSize} radius="50%" />
              <Box style={{ flex: 1 }}>
                <Flex direction="column" gap="xs">
                  {row.widths.slice(0, linesPerRow).map((w) => (
                    <Skeleton key={w} height={w === row.widths[0] ? 16 : 14} width={w} />
                  ))}
                </Flex>
              </Box>
            </Flex>
          ) : (
            <Flex direction="column" gap="xs" align="flex-start">
              {row.widths.slice(0, linesPerRow).map((w) => (
                <Skeleton key={w} height={w === row.widths[0] ? 16 : 14} width={w} />
              ))}
            </Flex>
          )}
        </Box>
      ))}
    </Stack>
  );
}

function takeRows(rows: number): SkeletonRow[] {
  if (rows <= DEFAULT_SKELETON_ROWS.length) {
    return DEFAULT_SKELETON_ROWS.slice(0, rows);
  }
  // Repeat the pattern when callers ask for more rows than the seed array.
  const out: SkeletonRow[] = [];
  for (let i = 0; i < rows; i++) {
    const template = DEFAULT_SKELETON_ROWS[i % DEFAULT_SKELETON_ROWS.length];
    const repeat = Math.floor(i / DEFAULT_SKELETON_ROWS.length);
    out.push({
      id: repeat === 0 ? template.id : `${template.id}-repeat-${repeat}`,
      widths: template.widths,
    });
  }
  return out;
}

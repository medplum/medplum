// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Flex, Skeleton, Stack } from '@mantine/core';
import type { JSX } from 'react';

// Configs
const SKELETON_WIDTHS = [
  ['85%', '60%', '72%'],
  ['70%', '80%', '55%'],
  ['92%', '50%', '65%'],
  ['78%', '68%', '58%'],
  ['88%', '45%', '75%'],
  ['74%', '70%', '62%'],
];

/**
 * ListWithDetailPaneSkeleton is the default loading placeholder for the list sidebar.
 * It renders a few rows of varied-width skeleton lines separated by dividers.
 * @returns The ListWithDetailPaneSkeleton React node.
 */
export function ListWithDetailPaneSkeleton(): JSX.Element {
  return (
    <Stack gap="md" p="md">
      {SKELETON_WIDTHS.map((widths, index) => (
        <Stack key={index}>
          <Flex direction="column" gap="xs" align="flex-start">
            <Skeleton height={16} width={widths[0]} />
            <Skeleton height={14} width={widths[1]} />
            <Skeleton height={14} width={widths[2]} />
          </Flex>
          <Divider />
        </Stack>
      ))}
    </Stack>
  );
}

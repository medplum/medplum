// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BoxProps } from '@mantine/core';
import { Box, Group, Pill } from '@mantine/core';
import type { JSX } from 'react';

interface AlphaBannerProps extends BoxProps {
  children: React.ReactNode;
}

export function AlphaBanner(props: AlphaBannerProps): JSX.Element {
  const { children, ...boxProps } = props;
  return (
    <Box bg="violet.0" p="sm" {...boxProps}>
      <Group gap="md">
        <Pill bg="violet.4" c="white">
          Alpha
        </Pill>
        <span>{children}</span>
      </Group>
    </Box>
  );
}

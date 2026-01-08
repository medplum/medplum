// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta, StoryObj } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';

import { Box, Stack, useMantineTheme } from '@mantine/core';

function Colors(): JSX.Element {
  const mantineTheme = useMantineTheme();
  return (
    <Document>
      <h1>Color Palette</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)' }}>
        {Object.entries(mantineTheme.colors).flatMap(([name, colors]) =>
          colors.map((color, idx) => (
            <Stack align="center" gap="xs" p="sm">
              <Box h={50} w={50} bg={color} />
              <span>
                {name}.{idx}
              </span>
            </Stack>
          ))
        )}
      </div>
    </Document>
  );
}

const meta = {
  title: 'Medplum/Colors',
  component: Colors,
} satisfies Meta<typeof Colors>;

export default meta;

type Story = StoryObj<typeof meta>;
export const Palette: Story = {
  args: {},
};

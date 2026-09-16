// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Collapse, Group, Loader, Text } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import classes from './SectionHeader.module.css';

export interface SectionHeaderProps {
  readonly title: string;
  readonly children: ReactNode;
  /** Shows a small loading indicator next to the title while its items are being fetched. */
  readonly loading?: boolean;
}

export function SectionHeader(props: SectionHeaderProps): JSX.Element {
  const { title, children, loading } = props;
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Box>
      <Group gap={8} wrap="nowrap">
        <ActionIcon
          variant="subtle"
          color="gray"
          radius="xl"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? `Show ${title.toLowerCase()}` : `Hide ${title.toLowerCase()}`}
          className={classes.chevron}
          data-collapsed={collapsed || undefined}
          size="md"
        >
          <IconChevronDown size={20} />
        </ActionIcon>
        <Text fz="md" fw={800} onClick={() => setCollapsed((c) => !c)} className={classes.title}>
          {title}
        </Text>
        {loading && <Loader size="xs" aria-label={`Loading ${title.toLowerCase()}`} />}
      </Group>

      <Collapse in={!collapsed} my="xs">
        {children}
      </Collapse>
    </Box>
  );
}

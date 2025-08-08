// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Collapse, Group, Text } from '@mantine/core';
import { IconChevronDown, IconPlus } from '@tabler/icons-react';
import { JSX, ReactNode, useState } from 'react';
import { killEvent } from '../utils/dom';
import classes from './CollapsibleSection.module.css';

export interface CollapsibleSectionProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly onAdd?: () => void;
}

export function CollapsibleSection(props: CollapsibleSectionProps): JSX.Element {
  const { title, children, onAdd } = props;
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Box className={classes.root}>
      <Group justify="space-between" className={classes.header}>
        <Group gap={8}>
          <ActionIcon
            variant="subtle"
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
        </Group>

        {onAdd && (
          <ActionIcon
            role="button"
            aria-label="Add item"
            className={classes.addButton}
            variant="subtle"
            onClick={(e) => {
              killEvent(e);
              onAdd();
            }}
            size="md"
          >
            <IconPlus size={18} />
          </ActionIcon>
        )}
      </Group>

      <Collapse in={!collapsed}>
        <Box ml="var(--mantine-spacing-xl)" mt="xs" mb="md" pl={4}>
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}

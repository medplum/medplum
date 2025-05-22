import { ActionIcon, Box, Collapse, Group, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconPlus } from '@tabler/icons-react';
import { JSX, ReactNode, useState } from 'react';
import { killEvent } from '../utils/dom';
import classes from './CollapsibleSection.module.css';

export interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  onAdd?: () => void;
}

export function CollapsibleSection({ title, children, onAdd }: CollapsibleSectionProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Box className={classes.root}>
      <UnstyledButton className={classes.header}>
        <Group justify="space-between">
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
      </UnstyledButton>

      <Collapse in={!collapsed}>
        <Box ml="var(--mantine-spacing-xl)" mt="xs" mb="md">
          {children || <Text c="dimmed">(none)</Text>}
        </Box>
      </Collapse>
    </Box>
  );
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Avatar, Badge, Group, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import type { ConfigPanelItem } from './ConfigPanel';
import classes from './ConfigRow.module.css';

export interface ConfigRowProps {
  readonly item: ConfigPanelItem;
  readonly icon?: ReactNode;
  readonly onSelect: (id: string) => void;
}

/**
 * One row of the configuration sidebar. Unlike a `CalendarRow`, which toggles whether a calendar is shown,
 * this picks what the detail pane shows, so the chosen row is marked current rather than pressed.
 * @param props - The row, an optional icon standing in for the avatar, and the selection handler.
 * @returns The row.
 */
export function ConfigRow(props: ConfigRowProps): JSX.Element {
  const { item, icon, onSelect } = props;

  return (
    <UnstyledButton
      className={classes.row}
      onClick={() => onSelect(item.id)}
      aria-current={item.selected || undefined}
      data-selected={item.selected || undefined}
    >
      <Group gap="sm" wrap="nowrap">
        {icon ? (
          <ThemeIcon variant="light" color="gray" radius="sm" size={20} className={classes.icon}>
            {icon}
          </ThemeIcon>
        ) : (
          <Avatar src={item.imageUrl} name={item.label} color="initials" radius="xl" size={28} />
        )}
        <Stack gap={2} className={classes.label}>
          {/* Bold as well as tinted: the tint alone is hard to tell from hover in dark mode. */}
          <Text truncate c={item.inactive ? 'dimmed' : undefined} fw={item.selected ? 600 : undefined}>
            {item.label}
          </Text>
          {!!item.notices?.length && (
            <Group gap={4}>
              {item.notices.map((notice) => (
                <Badge key={notice} size="xs" variant="light" color="orange">
                  {notice}
                </Badge>
              ))}
            </Group>
          )}
        </Stack>
        <StatusBadge item={item} />
      </Group>
    </UnstyledButton>
  );
}

function StatusBadge(props: { readonly item: ConfigPanelItem }): JSX.Element | null {
  if (props.item.inactive) {
    return (
      <Badge size="xs" variant="light" color="gray">
        Inactive
      </Badge>
    );
  }
  return null;
}

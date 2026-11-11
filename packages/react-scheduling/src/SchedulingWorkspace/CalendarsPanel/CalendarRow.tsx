// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Avatar, Box, Group, Menu, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconEye, IconEyeOff, IconFocus2 } from '@tabler/icons-react';
import type { JSX, MouseEvent, ReactNode } from 'react';
import { useState } from 'react';
import classes from './CalendarRow.module.css';
import type { CalendarsPanelItem } from './CalendarsPanel';

export interface CalendarRowProps {
  readonly item: CalendarsPanelItem;
  readonly icon?: ReactNode;
  readonly onToggle?: (id: string) => void;
  /** Whether the calendar is the one shown alone. */
  readonly focused?: boolean;
  /** Dims the row while another calendar is shown alone, as this one isn't shown. */
  readonly outsideFocus?: boolean;
  /** Gives the row a context menu showing its calendar alone, or all of them again when it is. */
  readonly onToggleFocus?: (id: string) => void;
}

export function CalendarRow(props: CalendarRowProps): JSX.Element {
  const { item, icon, onToggle, focused, outsideFocus, onToggleFocus } = props;
  const selected = item.selected ?? true;
  const interactive = !!onToggle;
  // Where the context menu was asked for, which is where it opens.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number }>();

  const openMenu = (event: MouseEvent): void => {
    event.preventDefault();
    setMenuAt({ x: event.clientX, y: event.clientY });
  };

  return (
    <>
      <UnstyledButton
        className={classes.row}
        onClick={interactive ? () => onToggle(item.id) : undefined}
        onContextMenu={onToggleFocus ? openMenu : undefined}
        aria-pressed={interactive ? selected : undefined}
        data-selected={selected || undefined}
        data-interactive={interactive || undefined}
        data-focused={focused || undefined}
        data-outside-focus={outsideFocus || undefined}
        component={interactive ? 'button' : 'div'}
      >
        <Group gap="sm" wrap="nowrap">
          {icon ? (
            <ThemeIcon variant="light" color="gray" radius="sm" size={20} className={classes.icon}>
              {icon}
            </ThemeIcon>
          ) : (
            <Avatar src={item.imageUrl} name={item.label} color="gray" radius="xl" size={28} />
          )}
          <Text truncate c={selected ? undefined : 'dimmed'}>
            {item.label}
          </Text>
          <div className={classes.eyeSlot}>
            {focused && (
              <IconFocus2 size={16} role="img" aria-label="Only calendar shown" className={classes.focusMark} />
            )}
            {selected ? (
              interactive && <IconEye size={16} aria-hidden="true" className={classes.eyeHint} />
            ) : (
              <IconEyeOff size={16} aria-hidden="true" className={classes.eyeOff} />
            )}
          </div>
        </Group>
      </UnstyledButton>
      {menuAt && onToggleFocus && (
        <Menu opened onChange={(opened) => !opened && setMenuAt(undefined)} position="bottom-start" offset={2}>
          <Menu.Target>
            <Box pos="fixed" left={menuAt.x} top={menuAt.y} />
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconFocus2 size={14} />} onClick={() => onToggleFocus(item.id)}>
              {focused ? 'Show all calendars' : 'Show only this calendar'}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
    </>
  );
}

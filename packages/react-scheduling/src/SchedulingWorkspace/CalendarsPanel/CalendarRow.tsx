// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Avatar, Group, Text, ThemeIcon, Tooltip, UnstyledButton } from '@mantine/core';
import { IconEye, IconEyeOff, IconFocus2 } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import classes from './CalendarRow.module.css';
import type { CalendarsPanelItem } from './CalendarsPanel';

export interface CalendarRowProps {
  readonly item: CalendarsPanelItem;
  readonly icon?: ReactNode;
  readonly onToggle?: (id: string) => void;
  /** Whether the calendar is the one focused on. */
  readonly focused?: boolean;
  /** Dims the row while another calendar is focused on, as this one isn't shown. */
  readonly outsideFocus?: boolean;
  /** Draws a button focusing on the calendar, or leaving it when focused. */
  readonly onToggleFocus?: (id: string) => void;
}

export function CalendarRow(props: CalendarRowProps): JSX.Element {
  const { item, icon, onToggle, focused, outsideFocus, onToggleFocus } = props;
  const selected = item.selected ?? true;
  const interactive = !!onToggle;

  const row = (
    <UnstyledButton
      className={classes.row}
      onClick={interactive ? () => onToggle(item.id) : undefined}
      aria-pressed={interactive ? selected : undefined}
      data-selected={selected || undefined}
      data-interactive={interactive || undefined}
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
          {selected ? (
            interactive && <IconEye size={16} aria-hidden="true" className={classes.eyeHint} />
          ) : (
            <IconEyeOff size={16} aria-hidden="true" className={classes.eyeOff} />
          )}
        </div>
      </Group>
    </UnstyledButton>
  );

  if (!onToggleFocus) {
    return row;
  }
  // Beside the row rather than in it, as one button can't hold another.
  return (
    <Group gap={0} wrap="nowrap" className={classes.withAction} data-focused={focused || undefined}>
      {row}
      <Tooltip label={focused ? 'Show all calendars' : 'Show only this calendar'} openDelay={500}>
        <ActionIcon
          variant={focused ? 'filled' : 'subtle'}
          color={focused ? 'blue' : 'gray'}
          size="sm"
          className={classes.focusButton}
          aria-label={`Focus ${item.label}`}
          aria-pressed={!!focused}
          onClick={() => onToggleFocus(item.id)}
        >
          <IconFocus2 size={14} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

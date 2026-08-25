// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Avatar, Group, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import classes from './CalendarRow.module.css';
import type { CalendarsPanelItem } from './CalendarsPanel';

export interface CalendarRowProps {
  readonly item: CalendarsPanelItem;
  readonly icon?: ReactNode;
  readonly color: string;
  readonly onToggle?: (id: string) => void;
}

export function CalendarRow(props: CalendarRowProps): JSX.Element {
  const { item, icon, color, onToggle } = props;
  const selected = item.selected ?? true;
  const interactive = !!onToggle;
  const muted = !selected;

  return (
    <UnstyledButton
      className={classes.row}
      onClick={interactive ? () => onToggle(item.id) : undefined}
      aria-pressed={interactive ? selected : undefined}
      data-selected={selected || undefined}
      data-interactive={interactive || undefined}
      component={interactive ? 'button' : 'div'}
    >
      <Group gap="sm" wrap="nowrap">
        {icon ? (
          <ThemeIcon variant="filled" color={muted ? 'gray' : color} radius="sm" size={20} className={classes.icon}>
            {icon}
          </ThemeIcon>
        ) : (
          <Avatar
            src={muted ? undefined : item.imageUrl}
            name={item.label}
            color={muted ? 'gray' : color}
            radius="xl"
            size={28}
          />
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
}

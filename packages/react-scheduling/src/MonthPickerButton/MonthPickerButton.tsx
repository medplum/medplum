// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ButtonProps } from '@mantine/core';
import { ActionIcon, Button, Group, Popover, SimpleGrid, Text } from '@mantine/core';
import { IconChevronDown, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import classes from './MonthPickerButton.module.css';

export interface MonthPickerButtonProps {
  readonly label: ReactNode;
  /** The month on show, which the picker opens on and marks. */
  readonly date: Date;
  readonly minDate?: Date;
  readonly size?: ButtonProps['size'];
  /** Called with local midnight on the first of the picked month. */
  readonly onChange: (month: Date) => void;
}

export function MonthPickerButton(props: MonthPickerButtonProps): JSX.Element {
  const { label, date, minDate, size = 'compact-sm', onChange } = props;
  const [opened, setOpened] = useState(false);
  const [year, setYear] = useState(date.getFullYear());
  const minMonth = minDate && new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'short' });

  function toggle(): void {
    if (!opened) {
      setYear(date.getFullYear());
    }
    setOpened(!opened);
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md">
      <Popover.Target>
        <Button
          variant="subtle"
          color="gray"
          size={size}
          classNames={{ label: classes.label }}
          rightSection={<IconChevronDown size={14} />}
          onClick={toggle}
        >
          {label}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Group justify="space-between" mb="xs">
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Previous year"
            disabled={!!minMonth && year <= minMonth.getFullYear()}
            onClick={() => setYear(year - 1)}
          >
            <IconChevronLeft size={16} />
          </ActionIcon>
          <Text fw={500}>{year}</Text>
          <ActionIcon variant="subtle" color="gray" aria-label="Next year" onClick={() => setYear(year + 1)}>
            <IconChevronRight size={16} />
          </ActionIcon>
        </Group>
        <SimpleGrid cols={3} spacing={4} verticalSpacing={4}>
          {Array.from({ length: 12 }, (_, monthIndex) => {
            const month = new Date(year, monthIndex, 1);
            const selected = year === date.getFullYear() && monthIndex === date.getMonth();
            return (
              <Button
                key={monthIndex}
                size="compact-sm"
                variant={selected ? 'filled' : 'subtle'}
                color={selected ? undefined : 'gray'}
                aria-pressed={selected}
                disabled={!!minMonth && month < minMonth}
                onClick={() => {
                  onChange(month);
                  setOpened(false);
                }}
              >
                {monthFormat.format(month)}
              </Button>
            );
          })}
        </SimpleGrid>
      </Popover.Dropdown>
    </Popover>
  );
}

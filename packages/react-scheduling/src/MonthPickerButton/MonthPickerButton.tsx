// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ButtonProps } from '@mantine/core';
import { Button, Popover } from '@mantine/core';
import { MonthPicker } from '@mantine/dates';
import { IconChevronDown } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import classes from './MonthPickerButton.module.css';

export interface MonthPickerButtonProps {
  readonly label: ReactNode;
  /** The month on show, which the picker opens on and marks. */
  readonly date: Date;
  readonly minDate?: Date;
  readonly size?: ButtonProps['size'];
  /** Called with the first of the picked month, as `YYYY-MM-DD`. */
  readonly onChange: (month: string) => void;
}

export function MonthPickerButton(props: MonthPickerButtonProps): JSX.Element {
  const { label, date, minDate, size = 'compact-sm', onChange } = props;
  const [opened, setOpened] = useState(false);

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md">
      <Popover.Target>
        <Button
          variant="subtle"
          color="gray"
          size={size}
          classNames={{ label: classes.label }}
          rightSection={<IconChevronDown size={14} />}
          onClick={() => setOpened((o) => !o)}
        >
          {label}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <MonthPicker
          size="xs"
          value={date}
          minDate={minDate}
          onChange={(value) => {
            if (value) {
              onChange(value);
              setOpened(false);
            }
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

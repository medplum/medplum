// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Indicator, Popover, Tooltip, VisuallyHidden } from '@mantine/core';
import { IconCirclePlus } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useId } from 'react';
import controlClasses from './SearchControl.module.css';
import classes from './SearchToolbarPopover.module.css';

export interface SearchToolbarPopoverProps {
  readonly label: string;
  readonly icon: ReactNode;
  readonly width: number;
  readonly opened: boolean;
  readonly onToggle: () => void;
  readonly onChange: (opened: boolean) => void;
  /** Describes the active state (e.g. "2 Filters Applied"); shows the indicator dot and tooltip when set. */
  readonly activeLabel?: string;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}

/**
 * Shared shell for the {@link SearchControl} toolbar popovers (Columns, Filters, Sort): the toolbar
 * button with its optional active-state indicator, and the dropdown with an optional footer.
 * @param props - The popover props.
 * @returns The popover React node.
 */
export function SearchToolbarPopover(props: SearchToolbarPopoverProps): JSX.Element {
  const { opened, activeLabel } = props;
  const activeLabelId = useId();
  return (
    <Popover
      opened={opened}
      onChange={props.onChange}
      position="bottom-start"
      shadow="md"
      radius="md"
      width={props.width}
      trapFocus
      returnFocus
      closeOnClickOutside
    >
      <Indicator className={classes.indicator} disabled={!activeLabel} color="blue" size={8} offset={6}>
        <Tooltip label={activeLabel ?? ''} position="bottom" openDelay={500} disabled={!activeLabel || opened}>
          <Popover.Target>
            <Button
              className={controlClasses.toolbarButton}
              data-opened={opened || undefined}
              size="compact-md"
              variant="subtle"
              color="gray"
              leftSection={props.icon}
              aria-describedby={activeLabel ? activeLabelId : undefined}
              onClick={props.onToggle}
            >
              {props.label}
            </Button>
          </Popover.Target>
        </Tooltip>
      </Indicator>
      {activeLabel && <VisuallyHidden id={activeLabelId}>{activeLabel}</VisuallyHidden>}
      <Popover.Dropdown className={classes.dropdown}>
        {props.children}
        {props.footer && <div className={classes.footer}>{props.footer}</div>}
      </Popover.Dropdown>
    </Popover>
  );
}

export function AddRowButton(props: { readonly label: string; readonly onClick: () => void }): JSX.Element {
  return (
    <Button
      className={classes.addButton}
      size="compact-sm"
      variant="subtle"
      color="blue"
      leftSection={<IconCirclePlus size={16} />}
      fw={500}
      onClick={props.onClick}
    >
      {props.label}
    </Button>
  );
}

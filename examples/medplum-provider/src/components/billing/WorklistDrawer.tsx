// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Drawer } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import classes from './WorklistDrawer.module.css';

export interface WorklistDrawerProps {
  readonly opened: boolean;
  /** The drawer's accessible name, e.g. "Claim". */
  readonly label: string;
  /** The width of the worklist area the drawer opens over. */
  readonly areaWidth: number;
  /** An exact width instead, e.g. to cover just the content area beside a sidebar. */
  readonly width?: number;
  readonly onClose: () => void;
  readonly children?: ReactNode;
}

/**
 * A worklist item's detail in a drawer over the list, leaving the list's first 300px in view. Like a modal, its
 * overlay blocks the page behind it, and a click on the overlay closes it.
 * @param props - The WorklistDrawer React props.
 * @returns The WorklistDrawer React node.
 */
export function WorklistDrawer(props: WorklistDrawerProps): JSX.Element {
  const { opened, label, areaWidth, onClose, children } = props;
  const width = props.width || (areaWidth ? Math.max(areaWidth - 300, 400) : undefined);

  return (
    <Drawer.Root
      opened={opened}
      onClose={onClose}
      position="right"
      styles={width ? { content: { '--drawer-flex': `0 0 ${width}px` } } : undefined}
    >
      <Drawer.Overlay />
      <Drawer.Content aria-label={label}>
        <Drawer.Body className={classes.body}>{children}</Drawer.Body>
      </Drawer.Content>
    </Drawer.Root>
  );
}

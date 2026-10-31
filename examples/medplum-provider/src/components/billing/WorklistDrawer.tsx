// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Drawer } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import classes from './WorklistDrawer.module.css';

export interface WorklistDrawerProps {
  readonly opened: boolean;
  /** The drawer's accessible name, e.g. "Claim". */
  readonly label: string;
  /** The width of the worklist area the drawer opens over. */
  readonly areaWidth: number;
  readonly onClose: () => void;
  readonly children?: ReactNode;
}

/**
 * A worklist item's detail in a drawer over the list. It leaves the list's first 300px in view and clickable, so
 * picking another row swaps the drawer's contents, and closes on a click anywhere else.
 * @param props - The WorklistDrawer React props.
 * @returns The WorklistDrawer React node.
 */
export function WorklistDrawer(props: WorklistDrawerProps): JSX.Element {
  const { opened, label, areaWidth, onClose, children } = props;
  const contentRef = useRef<HTMLDivElement>(null);
  const width = areaWidth ? Math.max(areaWidth - 300, 400) : undefined;

  useEffect(() => {
    if (!opened) {
      return undefined;
    }
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Element;
      if (
        !contentRef.current?.contains(target) &&
        !target.closest?.('[data-portal], [data-testid="search-control-row"], [data-worklist-row]')
      ) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [opened, onClose]);

  return (
    <Drawer.Root
      opened={opened}
      onClose={onClose}
      position="right"
      styles={width ? { content: { '--drawer-flex': `0 0 ${width}px` } } : undefined}
      trapFocus={false}
      lockScroll={false}
    >
      <Drawer.Content aria-label={label} ref={contentRef}>
        <Drawer.Body className={classes.body}>{children}</Drawer.Body>
      </Drawer.Content>
    </Drawer.Root>
  );
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex } from '@mantine/core';
import cx from 'clsx';
import type { JSX, ReactNode } from 'react';
import classes from './List.module.css';

export interface ListDetailLayoutProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Layout primitive for a list-on-the-left, detail-on-the-right pane (and any
 * additional columns to the right of that). Wraps children in a full-height
 * flex row and clips overflow, replacing the boilerplate
 * `<Box w="100%" h="100%"><Flex h="100%">…</Flex></Box>` wrapper that every
 * board reimplemented. Each child is responsible for its own width and border
 * (use `ListShell` for the list column, or `<ListDetailLayout.Column bordered>`
 * for arbitrary panels).
 * @param props - The layout props (children, className).
 * @returns The wrapped layout element.
 */
export function ListDetailLayout(props: ListDetailLayoutProps): JSX.Element {
  const { children, className } = props;
  return (
    <Flex h="100%" w="100%" direction="row" className={className} style={{ overflow: 'hidden' }}>
      {children}
    </Flex>
  );
}

export interface ListDetailColumnProps {
  readonly children: ReactNode;
  readonly bordered?: boolean;
  readonly className?: string;
  /** Width of the column. When omitted, the column flexes to fill remaining space. */
  readonly width?: number | string;
  /** Allow the column to shrink below its content size. Defaults to `true` for flex columns. */
  readonly allowShrink?: boolean;
}

/**
 * A panel column to live next to `ListShell` inside `ListDetailLayout`. Use
 * `bordered` to apply the shared right-side separator. Use `width` for a fixed
 * column; omit `width` for the flex-fill detail column.
 *
 * Exposed both as a named export and as `ListDetailLayout.Column` for compound usage.
 * @param props - The column props (children, bordered, width, etc.).
 * @returns The column element.
 */
export function ListDetailColumn(props: ListDetailColumnProps): JSX.Element {
  const { children, bordered, className, width, allowShrink } = props;
  const isFixed = width !== undefined;
  return (
    <Box
      h="100%"
      w={isFixed ? width : undefined}
      className={cx(bordered && classes.detailBorder, className)}
      style={{
        flex: isFixed ? `0 0 ${typeof width === 'number' ? `${width}px` : width}` : 1,
        minWidth: (allowShrink ?? !isFixed) ? 0 : undefined,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {children}
    </Box>
  );
}

ListDetailLayout.Column = ListDetailColumn;

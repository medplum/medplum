// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Flex } from '@mantine/core';
import cx from 'clsx';
import type { JSX, ReactNode } from 'react';
import classes from './List.module.css';

export interface ListShellProps {
  readonly header?: ReactNode;
  /**
   * Footer rendered below the scrollable list area. Render whatever you like
   * here — `ListShell` does NOT wrap the node in a divider or apply padding,
   * so a no-op footer (e.g. `<ListPagination>` returning `null` when there's
   * nothing to paginate) leaves no visual residue. `ListPagination` provides
   * its own divider + centered padding.
   */
  readonly footer?: ReactNode;
  readonly children: ReactNode;
  /**
   * Width of the list column. Accepts any Mantine width value (number for px,
   * or a string like `'380px'`, `'30%'`, `'100%'`). Defaults to `380`.
   */
  readonly width?: number | string;
  readonly withBorder?: boolean;
  readonly className?: string;
}

/**
 * Container for a vertical list column with optional header and footer slots.
 * Designed as the left column inside `ListDetailLayout`, but works standalone.
 * The body area auto-clips and is meant to wrap a `ListScrollArea` so list
 * rows scroll without affecting the header/footer.
 * @param props - Layout options (header, footer, children, width, withBorder, className).
 * @returns The shell element.
 */
export function ListShell(props: ListShellProps): JSX.Element {
  const { header, footer, children, width = 380, withBorder = true, className } = props;
  return (
    <Flex
      direction="column"
      w={width}
      h="100%"
      className={cx(withBorder && classes.shell, className)}
      style={{ flexShrink: 0 }}
    >
      {header && (
        <>
          <Flex h={64} align="center" justify="space-between" pl="xs" pr="lg" py="md">
            {header}
          </Flex>
          <Divider mx="xs" color="gray.2" />
        </>
      )}
      <Flex direction="column" style={{ flex: 1, overflow: 'hidden' }}>
        {children}
        {footer}
      </Flex>
    </Flex>
  );
}

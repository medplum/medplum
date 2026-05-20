// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineSpacing } from '@mantine/core';
import { Box, ScrollArea } from '@mantine/core';
import type { JSX, ReactNode } from 'react';

export interface ListScrollAreaProps {
  readonly children: ReactNode;
  readonly id?: string;
  /** Padding for list content. Defaults to Mantine `xs`. */
  readonly padding?: MantineSpacing;
}

/**
 * Scrollable body for a list column. Wraps a Mantine `ScrollArea` configured
 * for hover-style scrollbars and applies consistent inner padding so the rows
 * don't sit flush against the column edges.
 * @param props - Scroll-area content and options (children, id, padding).
 * @returns The scroll-area element.
 */
export function ListScrollArea(props: ListScrollAreaProps): JSX.Element {
  const { children, id, padding = 'xs' } = props;
  return (
    <ScrollArea style={{ flex: 1 }} id={id} scrollbarSize={10} type="hover" scrollHideDelay={250}>
      <Box p={padding}>{children}</Box>
    </ScrollArea>
  );
}

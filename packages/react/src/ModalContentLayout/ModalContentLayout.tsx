// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Stack } from '@mantine/core';
import type { JSX, ReactNode } from 'react';

export interface ModalContentLayoutProps {
  readonly children: ReactNode;
  readonly footer: ReactNode;
  /** Scroll content in-place with standard modal horizontal/top padding (for sticky modal footers). */
  readonly insetContent?: boolean;
}

/**
 * Standard modal body layout: scrollable content above a pinned action footer.
 * Pair with {@link ModalActionsFooter} for divider + full-width buttons.
 * @param props - The ModalContentLayout React props.
 * @returns The ModalContentLayout React node.
 */
export function ModalContentLayout(props: ModalContentLayoutProps): JSX.Element {
  const { children, footer, insetContent } = props;

  if (insetContent) {
    return (
      <Box
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
        }}
      >
        <Box miw={0} px="lg" pt="lg" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {children}
        </Box>
        {footer}
      </Box>
    );
  }

  return (
    <Stack h="100%" justify="space-between" gap={0}>
      <Box flex={1} miw={0}>
        {children}
      </Box>
      {footer}
    </Stack>
  );
}

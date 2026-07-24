// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Divider, Stack } from '@mantine/core';
import type { JSX, ReactNode } from 'react';

const modalFooterBorder = '1px solid light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-4))';

export interface ModalActionsFooterProps {
  readonly children: ReactNode;
  /**
   * Pin footer to modal bottom with a full-bleed top border (mirrors the modal header).
   * Use with {@link ModalContentLayout} `insetContent` and a fixed-height modal body.
   */
  readonly sticky?: boolean;
}

/**
 * Divider + full-width action buttons. Use as the footer slot in {@link ModalContentLayout}.
 * @param props - The ModalActionsFooter React props.
 * @returns The ModalActionsFooter React node.
 */
export function ModalActionsFooter(props: ModalActionsFooterProps): JSX.Element {
  const { children, sticky } = props;

  if (sticky) {
    return (
      <Box flex="0 0 auto" style={{ borderTop: modalFooterBorder }} px="lg" py="lg">
        <Stack gap="sm">{children}</Stack>
      </Box>
    );
  }

  return (
    <Stack gap="lg" pt="lg" style={{ flexShrink: 0 }}>
      <Divider />
      <Stack gap="sm">{children}</Stack>
    </Stack>
  );
}

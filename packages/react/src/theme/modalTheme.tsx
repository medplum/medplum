// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Modal } from '@mantine/core';
import { IconX } from '@tabler/icons-react';

/**
 * Shared Mantine theme override for modals, giving every modal the same header
 * (bottom border, bold title, round close button) and a content shell that lets
 * `ModalContentLayout` scroll its body while `ModalActionsFooter` stays pinned.
 *
 * Lives here rather than in an individual app so the apps and Storybook render
 * modals identically. Apply it via the theme's `components` map:
 *
 * ```tsx
 * createTheme({ components: { Modal: medplumModalTheme } });
 * ```
 */
export const medplumModalTheme = Modal.extend({
  defaultProps: {
    padding: 'lg',
    radius: 'md',
    closeButtonProps: { icon: <IconX size={18} /> },
  },
  styles: {
    content: {
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
    header: {
      minHeight: 0,
      padding:
        'var(--mantine-spacing-sm) var(--mantine-spacing-sm) var(--mantine-spacing-sm) var(--mantine-spacing-lg)',
      borderBottom: '1px solid light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-4))',
      flexShrink: 0,
      position: 'static',
    },
    close: {
      width: '1.75rem',
      height: '1.75rem',
      borderRadius: '999px',
    },
    title: {
      fontWeight: 800,
    },
    body: {
      paddingTop: 'var(--mantine-spacing-lg)',
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
    },
  },
});

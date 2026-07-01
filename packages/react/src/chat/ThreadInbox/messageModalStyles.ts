// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ModalProps } from '@mantine/core';

/**
 * Shared Modal styling for the thread inbox dialogs (New Message / Message Settings),
 * matching the Send Fax modal: a bold (700) title, a header with an inset bottom border
 * acting as the divider under the header, and zero body padding so the body can lay out
 * its own `lg` spacing around content and the bottom button.
 */
export const MESSAGE_MODAL_STYLES: ModalProps['styles'] = {
  body: { padding: 0 },
  title: { fontWeight: 700 },
  header: {
    padding: 'var(--mantine-spacing-md) var(--mantine-spacing-lg)',
    backgroundImage: `linear-gradient(var(--mantine-color-gray-2), var(--mantine-color-gray-2))`,
    backgroundSize: 'calc(100% - 2 * var(--mantine-spacing-lg)) 1px',
    backgroundPosition: 'center bottom',
    backgroundRepeat: 'no-repeat',
  },
};

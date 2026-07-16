// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';

/**
 * Show a red "Error" notification for the given error, using the normalized
 * error message. Shared across the thread inbox dialogs and boards so every
 * failure surfaces the same way.
 * @param error - The error to display; normalized via `normalizeErrorString`.
 */
export function showErrorNotification(error: unknown): void {
  showNotification({
    title: 'Error',
    message: normalizeErrorString(error),
    color: 'red',
  });
}

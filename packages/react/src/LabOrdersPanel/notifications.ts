// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';

export function showErrorNotification(err: unknown): void {
  showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
}

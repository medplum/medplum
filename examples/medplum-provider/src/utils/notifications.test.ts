// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test, vi } from 'vitest';
import { showErrorNotification } from './notifications';
import * as core from '@medplum/core';
import { notifications } from '@mantine/notifications';

describe('notifications utils', () => {
  test('normalizes error and shows notification', () => {
    const normalizeSpy = vi.spyOn(core, 'normalizeErrorString').mockReturnValue('Mock error');
    const showSpy = vi.spyOn(notifications, 'show').mockImplementation(() => 'id');

    showErrorNotification('Original error');

    expect(normalizeSpy).toHaveBeenCalledWith('Original error');
    expect(showSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'red',
        title: 'Error',
        message: 'Mock error',
      })
    );

    normalizeSpy.mockRestore();
    showSpy.mockRestore();
  });
});

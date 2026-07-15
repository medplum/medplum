// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { OrderSetSyncResponse } from '@medplum/core';
import { describe, expect, test } from 'vitest';
import { buildOrderSetImportNotification } from './orderSetImportNotification';

function syncResponse(overrides: Partial<OrderSetSyncResponse>): OrderSetSyncResponse {
  return {
    mode: 'created',
    syncedCount: 0,
    failedCount: 0,
    results: [],
    ...overrides,
  };
}

describe('buildOrderSetImportNotification', () => {
  test('reports success when there is no sync result', () => {
    const n = buildOrderSetImportNotification(12, undefined);
    expect(n.color).toBe('green');
    expect(n.title).toBe('Success');
    expect(n.message).toContain('Imported 12 resources');
  });

  test('reports success when all medications synced', () => {
    const n = buildOrderSetImportNotification(
      12,
      syncResponse({ syncedCount: 3, failedCount: 0, results: [{ status: 'synced', actionTitle: 'Jardiance' }] })
    );
    expect(n.color).toBe('green');
    expect(n.title).toBe('Success');
  });

  test('warns and lists failed medications on partial sync', () => {
    const n = buildOrderSetImportNotification(
      12,
      syncResponse({
        syncedCount: 1,
        failedCount: 2,
        results: [
          { status: 'synced', actionTitle: 'Jardiance' },
          { status: 'failed', actionTitle: 'Ozempic' },
          { status: 'failed', activityDefinitionUrl: 'ActivityDefinition/xyz' },
        ],
      })
    );
    expect(n.color).toBe('yellow');
    expect(n.title).toBe('Order set partially synced');
    expect(n.message).toContain('2 of 3 medications failed');
    expect(n.message).toContain('Ozempic');
    expect(n.message).toContain('ActivityDefinition/xyz');
  });

  test('falls back to "medication" when a failed result has no title or url', () => {
    const n = buildOrderSetImportNotification(
      1,
      syncResponse({ syncedCount: 0, failedCount: 1, results: [{ status: 'failed' }] })
    );
    expect(n.message).toContain('medication');
  });
});

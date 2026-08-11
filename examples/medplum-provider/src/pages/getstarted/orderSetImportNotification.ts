// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { OrderSetSyncResponse } from '@medplum/core';

/** Mantine notification payload for the order-set import result. */
export interface OrderSetImportNotification {
  readonly color: string;
  readonly title: string;
  readonly message: string;
}

/**
 * Builds the notification shown after importing the demo order set.
 *
 * When the `$sync-orderset` operation reports that some medications failed to
 * sync to the e-prescribing vendor, surface a warning listing them — otherwise
 * the order set would silently apply with fewer meds than the PlanDefinition
 * requested. Otherwise report success.
 *
 * @param resourceCount - Number of resources imported by the batch.
 * @param syncResult - Decoded `$sync-orderset` response, or undefined when the
 *   operation is not deployed / no PlanDefinition was created.
 * @returns The notification color, title, and message.
 */
export function buildOrderSetImportNotification(
  resourceCount: number,
  syncResult: OrderSetSyncResponse | undefined
): OrderSetImportNotification {
  if (syncResult && syncResult.failedCount > 0) {
    const failedTitles = syncResult.results
      .filter((r) => r.status === 'failed')
      .map((r) => r.actionTitle ?? r.activityDefinitionUrl ?? 'medication')
      .join(', ');
    return {
      color: 'yellow',
      title: 'Order set partially synced',
      message: `Imported ${resourceCount} resources, but ${syncResult.failedCount} of ${
        syncResult.syncedCount + syncResult.failedCount
      } medications failed to sync and will not appear when prescribing: ${failedTitles}`,
    };
  }
  return {
    color: 'green',
    title: 'Success',
    message: `Imported ${resourceCount} resources for Geriatric T2DM Order Set`,
  };
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export type InstanceMode = 'marketplace' | 'api';

/**
 * Returns the configured instance mode, read from the `MEDPLUM_INSTANCE_MODE`
 * build-time environment variable. Defaults to 'marketplace'.
 */
export function getInstanceMode(): InstanceMode {
  const mode = import.meta.env.MEDPLUM_INSTANCE_MODE;
  return mode === 'api' ? 'api' : 'marketplace';
}

/**
 * Convenience helper: true when the app is running in marketplace mode.
 */
export function isMarketplaceMode(): boolean {
  return getInstanceMode() === 'marketplace';
}

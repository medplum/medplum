// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Returns the application name from environment variables or a default value.
 * @returns The application name.
 */
export function getAppName(): string {
  return import.meta.env.MEDPLUM_APP_NAME || 'Medplum';
}

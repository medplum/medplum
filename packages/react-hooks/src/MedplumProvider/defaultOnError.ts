// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumErrorDetails } from './MedplumProvider.context';

/**
 * The default error handler, which logs to the console.
 * @param error - The error to report.
 * @param details - Optional information about the error.
 */
export function defaultOnError(error: unknown, details?: MedplumErrorDetails): void {
  if (details) {
    console.error(error, details);
  } else {
    console.error(error);
  }
}

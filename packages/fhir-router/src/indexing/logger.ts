// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export function getLogger(): {
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  info: (...args: any[]) => void;
} {
  return {
    error: () => undefined,
    warn: () => undefined,
    info: () => undefined,
  };
}

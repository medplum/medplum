// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

const textEncoder = new TextEncoder();

/**
 * Apply a maximum string length to ensure the value can accommodate the maximum
 * size for a btree index entry: 2704 bytes. If the string is too large,
 * be as conservative as possible to avoid write errors by truncating to 675 characters
 * to accommodate the entire string being 4-byte UTF-8 code points.
 * @param value - The column value to truncate.
 * @returns The possibly truncated column value.
 */
export function truncateTextColumn(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (textEncoder.encode(value).length <= 2704) {
    return value;
  }

  return Array.from(value).slice(0, 675).join('');
}

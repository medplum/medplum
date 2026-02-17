// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

const MAX_BTREE_BYTES = 2704;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const truncationBuffer = new Uint8Array(MAX_BTREE_BYTES);

/**
 * Apply a maximum string length to ensure the value can accommodate the maximum
 * size for a btree index entry: 2704 bytes. Uses {@link TextEncoder.encodeInto} to
 * write the longest valid UTF-8 prefix that fits within the byte limit, avoiding
 * both partial multi-byte characters and unnecessarily aggressive truncation.
 * @param value - The column value to truncate.
 * @returns The possibly truncated column value.
 */
export function truncateTextColumn(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (textEncoder.encode(value).length <= MAX_BTREE_BYTES) {
    return value;
  }

  // encodeInto writes as many complete UTF-8 characters as fit in the buffer,
  // never producing a partial multi-byte sequence.
  const { written } = textEncoder.encodeInto(value, truncationBuffer);
  return textDecoder.decode(truncationBuffer.subarray(0, written));
}

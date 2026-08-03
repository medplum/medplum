// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Resource } from '@medplum/fhirtypes';

const BINARY_PREFIX = 'Binary/';
const BINARY_ID_REGEX = /^[a-f0-9-]+$/;

/**
 * Builds a set of Binary IDs from a resource.
 * @param resource - The resource to search for Binary references.
 * @param output - The output set where Binary IDs will be added.
 */
export function buildBinaryIds(resource: Resource, output: Set<string>): void {
  const stack: object[] = [resource];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (const item of current) {
        if (typeof item === 'object' && item) {
          stack.push(item);
        }
      }
    } else {
      for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
        const id = extractBinaryReference(key, value);
        if (id) {
          output.add(id);
        } else if (typeof value === 'object' && value) {
          stack.push(value);
        }
      }
    }
  }
}

function extractBinaryReference(key: string, value: unknown): string | undefined {
  if (key === 'url' && typeof value === 'string' && value.startsWith(BINARY_PREFIX)) {
    const id = value.slice(BINARY_PREFIX.length);
    if (BINARY_ID_REGEX.test(id)) {
      return id;
    }
  }
  return undefined;
}

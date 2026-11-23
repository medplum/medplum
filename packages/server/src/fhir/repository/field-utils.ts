// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getElementKeys, isObject } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';

/**
 * Removes a field from the input resource; supports nested fields.
 * @param input - The input resource.
 * @param path - The path to the field to remove
 */
export function removeField<T extends Resource>(input: T, path: string): void {
  let last: any[] = [input];
  const pathParts = path.split('.');
  for (let i = 0; i < pathParts.length; i++) {
    const pathPart = pathParts[i];

    if (i === pathParts.length - 1) {
      // final key part
      for (const item of last) {
        for (const key of getElementKeys(item, pathPart)) {
          delete item[key];
        }
      }
    } else {
      // intermediate key part
      const next: any[] = [];
      for (const lastItem of last) {
        for (const key of getElementKeys(lastItem, pathPart)) {
          if (Array.isArray(lastItem[key])) {
            // Primitive extension arrays are padded with nulls
            next.push(...lastItem[key].filter(isObject));
          } else if (isObject(lastItem[key])) {
            next.push(lastItem[key]);
          }
        }
      }
      last = next;
    }
  }
}

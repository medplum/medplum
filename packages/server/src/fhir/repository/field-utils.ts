// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isObject, PropertyType } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';

function lowercaseFirstLetter(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function resolveFieldName(input: any, fieldName: string): string[] {
  if (!fieldName.endsWith('[x]')) {
    return [fieldName];
  }

  const baseKey = fieldName.slice(0, -3);
  return Object.keys(input).filter((k) => {
    if (k.startsWith(baseKey)) {
      const maybePropertyType = k.substring(baseKey.length);
      if (maybePropertyType in PropertyType || lowercaseFirstLetter(maybePropertyType) in PropertyType) {
        return true;
      }
    }
    return false;
  });
}

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
        for (const key of resolveFieldName(item, pathPart)) {
          delete item[key];
        }
      }
    } else {
      // intermediate key part
      const next: any[] = [];
      for (const lastItem of last) {
        for (const key of resolveFieldName(lastItem, pathPart)) {
          if (lastItem[key] !== undefined) {
            if (Array.isArray(lastItem[key])) {
              next.push(...lastItem[key]);
            } else if (isObject(lastItem[key])) {
              next.push(lastItem[key]);
            }
          }
        }
      }
      last = next;
    }
  }
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isObject, PropertyType } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';

function lowercaseFirstLetter(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Returns the JSON keys that hold the given field.
 * The `id` and `extension` of a primitive element are stored separately from its value, under the same key prefixed with "_".
 * @param input - The object containing the field.
 * @param fieldName - The field name, which may be a choice-of-type (i.e., `value[x]`).
 * @returns The keys of the field, including the "_" keys.
 */
function resolveFieldName(input: any, fieldName: string): string[] {
  if (!fieldName.endsWith('[x]')) {
    return [fieldName, '_' + fieldName];
  }

  const baseKey = fieldName.slice(0, -3);
  return Object.keys(input).filter((k) => {
    const name = k.startsWith('_') ? k.substring(1) : k;
    if (name.startsWith(baseKey)) {
      const maybePropertyType = name.substring(baseKey.length);
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
              // Primitive extension arrays are padded with nulls
              next.push(...lastItem[key].filter(isObject));
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
